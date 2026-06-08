/** A request handler shared by the server, CORS wrapper, and route modules. */
export type Handler = (req: Request) => Response | Promise<Response>

/** JSON response helper shared by the server and all route modules. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
