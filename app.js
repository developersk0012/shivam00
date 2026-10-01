const $=s=>document.querySelector(s);
const auth=$("#auth"),home=$("#home"), signup=$("#signupForm"),login=$("#loginForm"),switchBtn=$("#switchAuth"),msg=$("#authMsg");
let users=JSON.parse(localStorage.getItem("sk_users")||"[]");
function showHome(){auth.classList.add("hidden");home.classList.remove("hidden");}
if(localStorage.getItem("sk_session")) showHome();
switchBtn.onclick=()=>{signup.classList.toggle("hidden");login.classList.toggle("hidden");$("#authTitle").textContent=signup.classList.contains("hidden")?"Welcome back":"Create your account";switchBtn.textContent=signup.classList.contains("hidden")?"New here? Create account":"Already have an account? Login";msg.textContent=""};
signup.onsubmit=e=>{e.preventDefault();let p=$("#signupPassword").value,c=$("#confirmPassword").value;if(p!==c){msg.textContent="Passwords do not match.";return}let u={id:crypto.randomUUID(),name:$("#name").value,photo:$("#photo").value,email:$("#signupEmail").value,password:p};if(users.some(x=>x.email===u.email)){msg.textContent="Email already registered.";return}users.push(u);localStorage.setItem("sk_users",JSON.stringify(users));localStorage.setItem("sk_session",u.id);showHome()};
login.onsubmit=e=>{e.preventDefault();let u=users.find(x=>x.email===$("#loginEmail").value&&x.password===$("#loginPassword").value);if(!u){msg.textContent="Invalid email or password.";return}localStorage.setItem("sk_session",u.id);showHome()};
$("#developerCard").onclick=()=>$("#devModal").classList.remove("hidden");
$("#closeModal").onclick=()=>$("#devModal").classList.add("hidden");
