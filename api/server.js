require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
app.use(helmet());
const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5500";
app.use(cors({ origin: allowedOrigin, methods: ["GET", "POST", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: "100kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const dataDir = path.resolve(process.env.DATA_DIR || "./data");
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("Set JWT_SECRET to a random value at least 32 characters long.");
}
const db = new Database(path.join(dataDir, "skhosting.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  script_path TEXT NOT NULL,
  container_name TEXT,
  status TEXT NOT NULL DEFAULT 'stopped',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(uploadDir, String(req.user.id))),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.py`)
});
const upload = multer({
  storage,
  limits: { fileSize: 512 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".py") return cb(new Error("Only .py files are accepted."));
    cb(null, true);
  }
});

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try {
    if (!token) throw new Error("Missing token");
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Please log in again." });
  }
}
function safeId() { return "bot-" + require("crypto").randomBytes(8).toString("hex"); }
function getOwnedBot(id, userId) {
  return db.prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?").get(id, userId);
}
function docker(args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    // The Docker daemon must only be available to trusted API code on a dedicated host.
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Docker command timed out")); }, timeoutMs);
    child.stdout.on("data", d => { if (out.length < 100000) out += d.toString(); });
    child.stderr.on("data", d => { if (err.length < 100000) err += d.toString(); });
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error((err || "Docker command failed").slice(0, 1000)));
    });
  });
}

app.get("/health", (req, res) => res.json({ ok: true, service: "SK Bot Hosting API" }));

app.post("/api/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Valid email required." });
  if (password.length < 12) return res.status(400).json({ error: "Use a password with at least 12 characters." });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users(email,password_hash) VALUES(?,?)").run(email, hash);
    const token = jwt.sign({ id: result.lastInsertRowid, email }, process.env.JWT_SECRET, { expiresIn: "12h" });
    fs.mkdirSync(path.join(uploadDir, String(result.lastInsertRowid)), { recursive: true, mode: 0o700 });
    res.status(201).json({ token, user: { id: result.lastInsertRowid, email } });
  } catch {
    res.status(409).json({ error: "Could not create account. The email may already be registered." });
  }
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid email or password." });
  const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: "12h" });
  res.json({ token, user: { id: user.id, email } });
});

app.use("/api", auth);

app.get("/api/bots", (req, res) => {
  const bots = db.prepare("SELECT id,name,status,created_at FROM bots WHERE user_id=? ORDER BY created_at DESC").all(req.user.id);
  res.json({ bots });
});

app.post("/api/bots", (req, res, next) => {
  upload.single("file")(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Upload one Python .py file." });
    const name = String(req.body.name || "My Telegram Bot").trim().slice(0, 60) || "My Telegram Bot";
    const id = safeId();
    const scriptPath = path.resolve(req.file.path);
    db.prepare("INSERT INTO bots(id,user_id,name,script_path,status) VALUES(?,?,?,?,?)")
      .run(id, req.user.id, name, scriptPath, "stopped");
    res.status(201).json({ id, name, status: "stopped", note: "Uploaded. Review the security warning before running untrusted code." });
  });
});

app.post("/api/bots/:id/start", async (req, res) => {
  const bot = getOwnedBot(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: "Bot not found." });
  const container = `sk-${req.user.id}-${bot.id}`;
  try {
    await docker(["rm", "-f", container]).catch(() => {});
    // Resource limits and hardening flags are defense-in-depth, not a complete sandbox.
    // Network access is needed for Telegram API calls; enforce outbound policy at host/firewall level.
    await docker([
      "run", "-d", "--name", container,
      "--label", `skhosting.user=${req.user.id}`,
      "--label", `skhosting.bot=${bot.id}`,
      "--memory=128m", "--cpus=0.25", "--pids-limit=64",
      "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
      "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--user=10001:10001", "--restart=no",
      "-v", `${bot.script_path}:/app/bot.py:ro`,
      "sk-bot-runner:latest"
    ]);
    db.prepare("UPDATE bots SET container_name=?,status='running' WHERE id=? AND user_id=?")
      .run(container, bot.id, req.user.id);
    res.json({ ok: true, status: "running" });
  } catch (e) {
    db.prepare("UPDATE bots SET status='error' WHERE id=? AND user_id=?").run(bot.id, req.user.id);
    res.status(500).json({ error: "Could not start bot. Check runner setup and server logs." });
  }
});

app.post("/api/bots/:id/stop", async (req, res) => {
  const bot = getOwnedBot(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: "Bot not found." });
  const container = bot.container_name || `sk-${req.user.id}-${bot.id}`;
  try { await docker(["rm", "-f", container]); } catch {}
  db.prepare("UPDATE bots SET status='stopped' WHERE id=? AND user_id=?").run(bot.id, req.user.id);
  res.json({ ok: true, status: "stopped" });
});

app.get("/api/bots/:id/logs", async (req, res) => {
  const bot = getOwnedBot(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: "Bot not found." });
  const container = bot.container_name || `sk-${req.user.id}-${bot.id}`;
  try {
    const logs = await docker(["logs", "--tail", "100", container]);
    res.type("text/plain").send(logs.slice(-20000));
  } catch {
    res.type("text/plain").send("No logs available. The bot may not be running.");
  }
});

app.delete("/api/bots/:id", async (req, res) => {
  const bot = getOwnedBot(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: "Bot not found." });
  const container = bot.container_name || `sk-${req.user.id}-${bot.id}`;
  try { await docker(["rm", "-f", container]); } catch {}
  try { fs.unlinkSync(bot.script_path); } catch {}
  db.prepare("DELETE FROM bots WHERE id=? AND user_id=?").run(bot.id, req.user.id);
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error("Request error:", err.message);
  res.status(500).json({ error: "Unexpected server error." });
});
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`SK Bot Hosting API listening on ${port}`));
