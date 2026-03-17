---
name: canvas-page-margins
description: Canvas pages should have top-left margins like a notebook - infinite only to bottom-right, not all directions
type: project
---

Canvas notes should behave like OneNote's infinite page system: infinite to the bottom and right, but with fixed margins on the top and left (like a real notebook page). Users cannot scroll/pan past the top-left origin.

**Why:** This matches the physical notebook metaphor and prevents content from being placed in negative space where it feels disorienting.

**How to apply:** When implementing page bounds, enforce camera limits so users can't pan above y=0 or left of x=0. Content starts at a margin offset (e.g., 40px from top, 40px from left).
