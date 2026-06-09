// Fixed ports/token so Playwright's baseURL and the page URL are statically known.
// Single CI job → no port-collision concern; deterministic beats random here.
export const SPA_PORT = 3210
export const SIDECAR_PORT = 3211
export const TOKEN = 'e2e-fixture-token'

/** The page URL the SPA expects: it reads ?port=&token= via readConnParams(). */
export const APP_PATH = `/?port=${SIDECAR_PORT}&token=${TOKEN}`
