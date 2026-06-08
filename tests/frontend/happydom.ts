import { GlobalRegistrator } from '@happy-dom/global-registrator'

// happy-dom's registrator overrides the global web primitives (Response, Request,
// Headers, fetch). Bun.serve-based sidecar tests in the same process need Bun's
// NATIVE versions, and frontend tests only need the DOM (document/window), not
// happy-dom's fetch stack. So register happy-dom for the DOM, then restore the
// native primitives that were in place beforehand.
const native = {
  Response: globalThis.Response,
  Request: globalThis.Request,
  Headers: globalThis.Headers,
  fetch: globalThis.fetch,
}

GlobalRegistrator.register({ url: 'http://localhost:3000/?port=9999&token=test-token' })

Object.assign(globalThis, native)
