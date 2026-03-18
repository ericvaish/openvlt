import { type NextRequest } from "next/server"
import { requireAuthWithVault, AuthError } from "@/lib/auth/middleware"
import { addLoginListener, type LoginEvent } from "@/lib/ai/claude-login"

export const dynamic = "force-dynamic"

/** GET: SSE stream of login events for a given session. */
export async function GET(request: NextRequest) {
  try {
    await requireAuthWithVault()
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ error: "Auth failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const sessionId = request.nextUrl.searchParams.get("session")
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing session parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(event: LoginEvent) {
        try {
          const data = JSON.stringify(event)
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`)
          )
          if (event.type === "done") {
            controller.close()
          }
        } catch {
          // Controller may be closed
        }
      }

      const unsubscribe = addLoginListener(sessionId, send)

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        unsubscribe()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
