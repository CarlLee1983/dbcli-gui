/** Permissive CORS for the localhost dev/Tauri webview.
 * Safe: auth is bearer-token (not cookies), so `*` origin leaks nothing without a token.
 * We deliberately do NOT set Access-Control-Allow-Credentials. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

type Handler = (req: Request) => Response | Promise<Response>

/** Wrap a handler so every response (including errors) carries CORS headers. */
export function withCors(handler: Handler): Handler {
  return async (req) => {
    const res = await handler(req)
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
    return res
  }
}

/** 204 response for OPTIONS preflight (runs before bearer auth — preflight carries no token). */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
