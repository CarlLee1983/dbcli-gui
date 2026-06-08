import { GlobalRegistrator } from '@happy-dom/global-registrator'

// Only register happy-dom for tests under tests/frontend/ to avoid
// polluting native Bun globals (Response, Headers, etc.) in sidecar/dev tests.
if (Bun.main.includes('/tests/frontend/')) {
  GlobalRegistrator.register({ url: 'http://localhost:3000/?port=9999&token=test-token' })
}
