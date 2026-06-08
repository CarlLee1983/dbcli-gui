use serde::Deserialize;
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Deserialize, PartialEq)]
struct ReadyLine {
    port: u16,
    token: String,
}

fn parse_ready_line(line: &str) -> Result<ReadyLine, String> {
    serde_json::from_str::<ReadyLine>(line)
        .map_err(|e| format!("invalid sidecar ready line ({e}): {line}"))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("dbcli-gui")
                .inner_size(1200.0, 800.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
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
