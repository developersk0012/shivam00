import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "Messages are required." });
    }

    const response = await fetch("https://tabitoken.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.TABITOKEN_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || data?.message || "AI API request failed."
      });
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(502).json({ error: "AI returned no text." });

    res.json({ reply: text });
  } catch (err) {
    res.status(500).json({ error: "Server error. Check your API key and API endpoint." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`AI Chat running at http://localhost:${port}`));
