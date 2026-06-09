use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Deserialize, PartialEq)]
struct ReadyLine {
    port: u16,
    token: String,
}

fn parse_ready_line(line: &str) -> Result<ReadyLine, String> {
    serde_json::from_str::<ReadyLine>(line)
        .map_err(|e| format!("invalid sidecar ready line ({e}): {line}"))
}

/// Holds the spawned sidecar child so we can kill it on exit.
struct SidecarState(Mutex<Option<Child>>);

/// Kills the wrapped sidecar if dropped before being disarmed — prevents an orphan
/// `bun` process if startup fails between spawn and handing the child to managed state.
struct KillOnDrop(Option<Child>);

impl Drop for KillOnDrop {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.take() {
            let _ = child.kill();
        }
    }
}

/// The dbcli-gui repo root = parent of the `src-tauri` crate dir. Dev-only resolution.
fn repo_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri always has a parent directory")
        .to_path_buf()
}

/// Write an exported file to a user-chosen path. The frontend picks the path via the
/// native save dialog (plugin-dialog), then hands us the text to write — `std::fs` has
/// no fs-scope restriction, unlike the fs plugin. App commands need no capability.
#[tauri::command]
fn write_export(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("failed to write {path}: {e}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_export])
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            // 1. spawn the sidecar; KillOnDrop ensures no orphan if startup fails below
            let mut sidecar = KillOnDrop(Some(
                Command::new("bun")
                    .args(["run", "sidecar/index.ts"])
                    .current_dir(repo_root())
                    .stdout(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("failed to spawn sidecar: {e}"))?,
            ));
            let child = sidecar.0.as_mut().expect("child present until disarmed");

            // 2. read the first stdout line: {"ready":true,"port":N,"token":"..."}
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "sidecar stdout was not piped".to_string())?;
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            // Blocks until the sidecar prints its ready line. No timeout: a sidecar that
            // spawns but never prints (dev-only failure mode) is acknowledged future scope.
            let n = reader
                .read_line(&mut line)
                .map_err(|e| format!("failed to read sidecar ready line: {e}"))?;
            if n == 0 {
                return Err("sidecar exited before printing a ready line".into());
            }
            let ready = parse_ready_line(line.trim())?;

            // startup succeeded — disarm the guard and take ownership of the child
            let child = sidecar.0.take().expect("child present until disarmed");

            // keep draining stdout so a full pipe never blocks the sidecar
            thread::spawn(move || {
                let mut sink = String::new();
                while reader.read_line(&mut sink).map(|n| n > 0).unwrap_or(false) {
                    sink.clear();
                }
            });

            // 3. store the child for kill-on-exit
            app.state::<SidecarState>().0.lock().unwrap().replace(child);

            // 4. if the sidecar dies on its own, take the app down too
            let handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(500));
                let state = handle.state::<SidecarState>();
                let mut guard = state.0.lock().unwrap();
                match guard.as_mut() {
                    Some(c) => match c.try_wait() {
                        Ok(Some(_)) | Err(_) => {
                            drop(guard);
                            handle.exit(0);
                            break;
                        }
                        Ok(None) => {}
                    },
                    None => break,
                }
            });

            // 5. open the window, injecting port/token before any page script runs
            // serde_json::to_string yields a properly JSON-escaped string literal (with quotes).
            let token_json = serde_json::to_string(&ready.token)
                .expect("serializing a String is infallible");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("dbcli-gui")
                .inner_size(1200.0, 800.0)
                .initialization_script(&format!(
                    "window.__DBCLI__ = {{ port: {}, token: {} }};",
                    ready.port, token_json
                ))
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri app")
        .run(|handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(mut child) =
                    handle.state::<SidecarState>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_valid_ready_line() {
        let got = parse_ready_line(r#"{"ready":true,"port":54321,"token":"deadbeef"}"#).unwrap();
        assert_eq!(got, ReadyLine { port: 54321, token: "deadbeef".to_string() });
    }

    #[test]
    fn rejects_a_line_missing_fields() {
        assert!(parse_ready_line(r#"{"ready":true,"port":54321}"#).is_err());
    }

    #[test]
    fn rejects_non_json() {
        assert!(parse_ready_line("not json at all").is_err());
    }
}
