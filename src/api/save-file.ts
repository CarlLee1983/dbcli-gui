/**
 * Save a generated file to disk. Two paths, picked by environment:
 *
 * - **Tauri shell**: the WKWebview silently ignores a blob `<a download>`, so we use
 *   the native save dialog (plugin-dialog) and write through the app's `write_export`
 *   command (Rust `std::fs`, no fs-scope juggling).
 * - **Dev browser**: a transient `<a download>` anchor, which works normally there.
 */

import { inTauri } from './tauri-env'

/** Browser fallback: download via a transient `<a download>` anchor. */
function anchorDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Prompt for a location and write `blob` there. Resolves silently when the user
 * cancels the native dialog. Exports are text (CSV/JSON), so content crosses the IPC
 * boundary as a UTF-8 string rather than a byte array.
 */
export async function saveFile(filename: string, blob: Blob): Promise<void> {
  if (!inTauri()) {
    anchorDownload(filename, blob)
    return
  }
  const [{ save }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core'),
  ])
  const path = await save({ defaultPath: filename })
  if (!path) return // user cancelled
  await invoke('write_export', { path, contents: await blob.text() })
}
