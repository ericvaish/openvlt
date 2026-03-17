---
name: no-kill-ports
description: Never kill processes on ports like 3000/3001 — it kills the user's Firefox browser
type: feedback
---

Never use `fuser -k`, `lsof | xargs kill`, or similar commands to kill processes on network ports. This kills the user's Firefox browser which is connected to those ports.

**Why:** The user's browser has active connections to localhost ports, so killing processes on those ports terminates their browser.

**How to apply:** When a dev server port is in use, either use a different port or ask the user to close/restart the server manually. Never force-kill processes on ports.
