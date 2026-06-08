import { GlobalRegistrator } from '@happy-dom/global-registrator'

// happy-dom's registrator shadows MANY native global web primitives (Response,
// Request, Headers, fetch, URL, crypto, Event, ...). Bun.serve-based sidecar/dev
// tests run in the same process and need Bun's NATIVE implementations, while
// frontend tests only need the DOM-specific globals happy-dom ADDS (document,
// window, location, navigator, ...).
//
// Strategy: snapshot every global Bun already had, register happy-dom, then
// restore those native descriptors. Globals that did not exist before
// registration (the actual DOM) are left as happy-dom installed them.
const nativeDescriptors = new Map<string, PropertyDescriptor>()
for (const key of Object.getOwnPropertyNames(globalThis)) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key)
  if (desc) nativeDescriptors.set(key, desc)
}

GlobalRegistrator.register({ url: 'http://localhost:3000/?port=9999&token=test-token' })

// happy-dom's dispatchEvent does `event instanceof Event` against ITS OWN Event
// class, so we must NOT restore Bun's native Event/EventTarget/*Event globals —
// fireEvent would otherwise construct events happy-dom rejects. Everything else
// (Response/Request/Headers/fetch, URL, crypto, ...) is restored to native.
const isDomEventClass = (key: string) => key === 'EventTarget' || key.endsWith('Event')

for (const [key, desc] of nativeDescriptors) {
  if (isDomEventClass(key)) continue
  try {
    Object.defineProperty(globalThis, key, desc)
  } catch {
    // Some globals are non-configurable; leaving happy-dom's value is harmless.
  }
}
