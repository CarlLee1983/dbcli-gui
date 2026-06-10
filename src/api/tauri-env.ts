/**
 * Detect whether we're running inside the Tauri shell rather than a dev browser.
 *
 * `window.__TAURI__` is NOT reliable: under Tauri v2 it is only injected when
 * `app.withGlobalTauri` is enabled (we don't enable it). `__TAURI_INTERNALS__`,
 * by contrast, is always present inside a Tauri webview, and the app shell also
 * injects `window.__DBCLI__`. Either signal means "use the native path".
 */
export function inTauri(): boolean {
  return (
    typeof (globalThis as { __DBCLI__?: unknown }).__DBCLI__ !== 'undefined' ||
    '__TAURI_INTERNALS__' in globalThis
  )
}
