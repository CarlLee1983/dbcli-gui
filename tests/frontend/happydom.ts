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
//
// Exception: DOM event classes (Event, EventTarget, CustomEvent, InputEvent,
// etc.) must remain as happy-dom's versions. happy-dom's dispatchEvent checks
// `event instanceof Event` using its own Event class, so restoring Bun's native
// Event constructor would cause that check to fail when fireEvent.change() is
// called from @testing-library/dom.
const DOM_EVENT_CLASSES = new Set([
  'Event', 'EventTarget', 'CustomEvent', 'InputEvent', 'UIEvent',
  'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'WheelEvent',
  'PointerEvent', 'TouchEvent', 'DragEvent', 'ClipboardEvent',
  'CompositionEvent', 'AnimationEvent', 'TransitionEvent',
  'MessageEvent', 'ErrorEvent', 'ProgressEvent', 'StorageEvent',
  'HashChangeEvent', 'PopStateEvent', 'PageTransitionEvent',
])

const nativeDescriptors = new Map<string, PropertyDescriptor>()
for (const key of Object.getOwnPropertyNames(globalThis)) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key)
  if (desc) nativeDescriptors.set(key, desc)
}

GlobalRegistrator.register({ url: 'http://localhost:3000/?port=9999&token=test-token' })

for (const [key, desc] of nativeDescriptors) {
  // Keep happy-dom's DOM event classes so that dispatchEvent instanceof checks pass.
  if (DOM_EVENT_CLASSES.has(key)) continue
  try {
    Object.defineProperty(globalThis, key, desc)
  } catch {
    // Some globals are non-configurable; leaving happy-dom's value is harmless.
  }
}
