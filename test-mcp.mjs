// Use the HTTP API instead - the server is already running
const BASE_URL = "http://localhost:3000"

// First, we need to log in to get a session
const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "ericv", password: "test" })
})
const loginData = await loginRes.json()
console.log("Login:", loginRes.status, JSON.stringify(loginData))
