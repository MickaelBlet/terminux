//! Persisted window layout (`first_window_preference = "persisted_window_layout"`).

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde_json::{Value, json};

use crate::config;

fn path() -> PathBuf {
    config::state_dir().join("session.json")
}

/// Saved windows, in window order.
pub fn load() -> Vec<Value> {
    let Ok(src) = std::fs::read_to_string(path()) else { return Vec::new() };
    let Ok(v) = serde_json::from_str::<Value>(&src) else { return Vec::new() };
    v.get("windows")
        .and_then(Value::as_array)
        .map(|w| w.iter().filter(|s| has_tabs(s)).cloned().collect())
        .unwrap_or_default()
}

pub fn has_tabs(snapshot: &Value) -> bool {
    ["tabs", "editors"]
        .iter()
        .any(|k| snapshot.get(k).and_then(Value::as_array).is_some_and(|t| !t.is_empty()))
}

/// Write snapshots keyed by window id.
pub fn write(windows: &BTreeMap<u32, Value>) {
    let list: Vec<&Value> = windows.values().filter(|s| has_tabs(s)).collect();
    let file = path();
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = file.with_extension("json.tmp");
    let body = json!({ "version": 1, "windows": list });
    if std::fs::write(&tmp, body.to_string()).is_ok() {
        let _ = std::fs::rename(&tmp, &file);
    }
}

/// Window bounds of a snapshot: (x, y, width, height, maximized).
pub fn bounds(snapshot: &Value) -> Option<(f64, f64, f64, f64, bool)> {
    let b = snapshot.get("bounds")?;
    let n = |k: &str| b.get(k).and_then(Value::as_f64);
    Some((n("x")?, n("y")?, n("width")?, n("height")?, b.get("maximized").and_then(Value::as_bool).unwrap_or(false)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounds_and_tabs() {
        let s = json!({ "tabs": [{}], "bounds": { "x": 1.0, "y": 2, "width": 300, "height": 200, "maximized": true } });
        assert!(has_tabs(&s));
        assert_eq!(bounds(&s), Some((1.0, 2.0, 300.0, 200.0, true)));
        assert!(!has_tabs(&json!({ "tabs": [] })));
        assert_eq!(bounds(&json!({})), None);
    }
}
