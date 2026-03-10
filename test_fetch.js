const fetch = require('node-fetch');
async function run() {
  const items = [{"ticker":"MSFT","name":"Custom Asset","quantity":100,"sector":"Unknown"}];
  const res = await fetch("http://localhost:8000/portfolio", {
      method: "POST",
      body: JSON.stringify(items),
      headers: { "Content-Type": "application/json" }
  });
  console.log("STATUS:", res.status);
  const data = await res.json();
  console.log("DATA:", JSON.stringify(data));
}
run();
