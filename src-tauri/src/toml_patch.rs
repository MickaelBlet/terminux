//! Comment-preserving edits of config.toml for the settings UI.
//!
//! The UI reads the raw document with [`parse`] (JSON, no fragment merging) and writes back with
//! [`patch`]: a list of operations addressed by paths like `["profile", 2, "font", "size"]`.

use serde::Deserialize;
use serde_json::Value as Json;
use toml_edit::{Array, ArrayOfTables, DocumentMut, InlineTable, Item, Table, Value};

/// Path segment: a table key or an array (of tables) index.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Seg {
    Index(usize),
    Key(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum PatchOp {
    /// Set a value, creating missing tables; `null` removes it.
    Set { path: Vec<Seg>, value: Json },
    /// Remove a key or an array element; tables left empty are removed too.
    Remove { path: Vec<Seg> },
    /// Insert into the array (of tables) at `path`, created if missing; no index = append.
    Insert {
        path: Vec<Seg>,
        #[serde(default)]
        index: Option<usize>,
        value: Json,
    },
    /// Move an element of the array (of tables) at `path`.
    Move { path: Vec<Seg>, from: usize, to: usize },
}

/// The document as JSON, without merging fragments or generated profiles.
pub fn parse(src: &str) -> Result<Json, String> {
    toml::from_str(src).map_err(|e| e.to_string())
}

/// Apply `ops` in order to `src`, keeping comments and layout of untouched parts.
pub fn patch(src: &str, ops: &[PatchOp]) -> Result<String, String> {
    let mut doc: DocumentMut = src.parse().map_err(|e: toml_edit::TomlError| e.to_string())?;
    for op in ops {
        apply(doc.as_item_mut(), op)?;
    }
    Ok(doc.to_string())
}

fn apply(root: &mut Item, op: &PatchOp) -> Result<(), String> {
    match op {
        PatchOp::Set { path, value } if value.is_null() => remove(root, path),
        PatchOp::Set { path, value } => {
            let (last, parents) = path.split_last().ok_or("empty path")?;
            set_child(walk_create(root, parents)?, last, value)
        }
        PatchOp::Remove { path } => remove(root, path),
        PatchOp::Insert { path, index, value } => insert(root, path, *index, value),
        PatchOp::Move { path, from, to } => move_element(root, path, *from, *to),
    }
}

fn seg_name(s: &Seg) -> String {
    match s {
        Seg::Index(i) => i.to_string(),
        Seg::Key(k) => k.clone(),
    }
}

fn is_missing(item: Option<&Item>) -> bool {
    item.is_none_or(Item::is_none)
}

/// A table created for a path: implicit, so it has no header while it only holds sub-tables.
fn new_table() -> Table {
    let mut t = Table::new();
    t.set_implicit(true);
    t
}

/// Child `seg` of `item`; a missing table key is created when `create`.
fn child<'a>(item: &'a mut Item, seg: &Seg, create: bool) -> Result<&'a mut Item, String> {
    match seg {
        Seg::Index(i) => item.get_mut(*i).ok_or_else(|| format!("index {i} out of range")),
        Seg::Key(k) => {
            let inline = item.is_inline_table();
            let t = item.as_table_like_mut().ok_or_else(|| format!("{k}: parent is not a table"))?;
            if is_missing(t.get(k)) {
                if !create {
                    return Err(format!("{k}: not found"));
                }
                let empty = if inline { Item::Value(Value::InlineTable(InlineTable::new())) } else { Item::Table(new_table()) };
                t.insert(k, empty);
            }
            Ok(t.get_mut(k).expect("just inserted"))
        }
    }
}

fn walk_create<'a>(mut item: &'a mut Item, path: &[Seg]) -> Result<&'a mut Item, String> {
    for s in path {
        item = child(item, s, true)?;
    }
    Ok(item)
}

fn lookup<'a>(mut item: &'a mut Item, path: &[Seg]) -> Option<&'a mut Item> {
    for s in path {
        item = child(item, s, false).ok()?;
    }
    Some(item)
}

fn to_value(j: &Json) -> Result<Value, String> {
    Ok(match j {
        Json::Bool(b) => (*b).into(),
        Json::Number(n) => match n.as_i64() {
            Some(i) => i.into(),
            None => n.as_f64().ok_or("invalid number")?.into(),
        },
        Json::String(s) => s.as_str().into(),
        Json::Array(a) => Value::Array(a.iter().map(to_value).collect::<Result<Array, _>>()?),
        Json::Object(o) => {
            let mut t = InlineTable::new();
            for (k, v) in o.iter().filter(|(_, v)| !v.is_null()) {
                t.insert(k, to_value(v)?);
            }
            Value::InlineTable(t)
        }
        Json::Null => return Err("null is not a TOML value".into()),
    })
}

/// A `[[array]]` element: scalar keys, nested objects as inline tables.
fn to_table(j: &Json) -> Result<Table, String> {
    let o = j.as_object().ok_or("expected a table")?;
    let mut t = Table::new();
    for (k, v) in o.iter().filter(|(_, v)| !v.is_null()) {
        t.insert(k, Item::Value(to_value(v)?));
    }
    Ok(t)
}

fn set_child(parent: &mut Item, seg: &Seg, value: &Json) -> Result<(), String> {
    match seg {
        Seg::Index(i) => replace(parent.get_mut(*i).ok_or_else(|| format!("index {i} out of range"))?, value),
        Seg::Key(k) => {
            let t = parent.as_table_like_mut().ok_or_else(|| format!("{k}: parent is not a table"))?;
            match t.get_mut(k) {
                Some(it) if !it.is_none() => replace(it, value),
                _ => {
                    t.insert(k, Item::Value(to_value(value)?));
                    Ok(())
                }
            }
        }
    }
}

/// Replace an existing item, keeping its comments where the shape allows it.
fn replace(it: &mut Item, value: &Json) -> Result<(), String> {
    match (&mut *it, value) {
        // A [table] stays a table: sync its keys one by one.
        (Item::Table(t), Json::Object(o)) => {
            let stale: Vec<String> = t.iter().map(|(k, _)| k.to_string()).filter(|k| o.get(k).is_none_or(Json::is_null)).collect();
            for k in stale {
                t.remove(&k);
            }
            for (k, v) in o.iter().filter(|(_, v)| !v.is_null()) {
                set_child(it, &Seg::Key(k.clone()), v)?;
            }
        }
        (Item::ArrayOfTables(_), Json::Array(a)) if a.iter().all(Json::is_object) => {
            let mut aot = ArrayOfTables::new();
            for v in a {
                aot.push(to_table(v)?);
            }
            *it = Item::ArrayOfTables(aot);
        }
        (Item::Value(old), _) => {
            let mut v = to_value(value)?;
            *v.decor_mut() = old.decor().clone();
            *old = v;
        }
        _ => *it = Item::Value(to_value(value)?),
    }
    Ok(())
}

fn remove(root: &mut Item, path: &[Seg]) -> Result<(), String> {
    let (last, parents) = path.split_last().ok_or("empty path")?;
    let Some(parent) = lookup(root, parents) else { return Ok(()) };
    match (last, parent) {
        (Seg::Key(k), p) => {
            if let Some(t) = p.as_table_like_mut() {
                t.remove(k);
            }
        }
        (Seg::Index(i), Item::ArrayOfTables(a)) if *i < a.len() => {
            a.remove(*i);
        }
        (Seg::Index(i), Item::Value(Value::Array(a))) if *i < a.len() => {
            a.remove(*i);
        }
        _ => return Ok(()),
    }
    prune(root, parents);
    Ok(())
}

/// Comments around a table header: such a table is kept even when empty.
fn has_comment(t: &Table) -> bool {
    let d = t.decor();
    [d.prefix(), d.suffix()].into_iter().flatten().any(|r| r.as_str().is_some_and(|s| s.contains('#')))
}

/// Remove tables left empty along `path`, deepest first (array elements and commented tables are kept).
fn prune(root: &mut Item, path: &[Seg]) {
    for n in (1..=path.len()).rev() {
        let Seg::Key(k) = &path[n - 1] else { return };
        let empty = match lookup(root, &path[..n]) {
            Some(Item::Table(t)) => t.is_empty() && !has_comment(t),
            Some(Item::Value(Value::InlineTable(t))) => t.is_empty(),
            Some(Item::ArrayOfTables(a)) => a.is_empty(),
            Some(Item::Value(Value::Array(a))) => a.is_empty(),
            _ => false,
        };
        if !empty {
            return;
        }
        if let Some(t) = lookup(root, &path[..n - 1]).and_then(Item::as_table_like_mut) {
            t.remove(k);
        }
    }
}

fn insert(root: &mut Item, path: &[Seg], index: Option<usize>, value: &Json) -> Result<(), String> {
    let (last, parents) = path.split_last().ok_or("empty path")?;
    let Seg::Key(k) = last else { return Err("insert path must end with a key".into()) };
    let parent = walk_create(root, parents)?;
    let inline = parent.is_inline_table();
    let t = parent.as_table_like_mut().ok_or_else(|| format!("{k}: parent is not a table"))?;
    if is_missing(t.get(k)) {
        let empty = if value.is_object() && !inline { Item::ArrayOfTables(ArrayOfTables::new()) } else { Item::Value(Value::Array(Array::new())) };
        t.insert(k, empty);
    }
    match t.get_mut(k).expect("just inserted") {
        Item::ArrayOfTables(a) => {
            let i = index.unwrap_or(a.len()).min(a.len());
            // A new table has no position: it is written right after the previous element.
            a.insert(i, to_table(value)?);
        }
        Item::Value(Value::Array(a)) => {
            let i = index.unwrap_or(a.len()).min(a.len());
            a.insert(i, to_value(value)?);
        }
        _ => return Err(format!("{k}: not an array")),
    }
    Ok(())
}

fn move_element(root: &mut Item, path: &[Seg], from: usize, to: usize) -> Result<(), String> {
    let name = path.iter().map(seg_name).collect::<Vec<_>>().join(".");
    match lookup(root, path) {
        Some(Item::ArrayOfTables(a)) if from < a.len() && to < a.len() => {
            let t = a.remove(from);
            a.insert(to, t);
            // Tables are written in document position order: give the whole array one position so
            // they follow the (new) array order, sub-tables staying under their element.
            let min = a.iter().filter_map(min_position).min();
            for t in a.iter_mut() {
                set_position(t, min);
            }
            Ok(())
        }
        Some(Item::Value(Value::Array(a))) if from < a.len() && to < a.len() => {
            let v = a.remove(from);
            a.insert(to, v);
            Ok(())
        }
        _ => Err(format!("{name}: no element to move")),
    }
}

fn sub_tables(t: &Table) -> impl Iterator<Item = &Table> {
    t.iter().flat_map(|(_, it)| match it {
        Item::Table(s) => vec![s],
        Item::ArrayOfTables(a) => a.iter().collect(),
        _ => vec![],
    })
}

fn min_position(t: &Table) -> Option<isize> {
    t.position().into_iter().chain(sub_tables(t).filter_map(min_position)).min()
}

fn set_position(t: &mut Table, pos: Option<isize>) {
    t.set_position(pos);
    for (_, it) in t.iter_mut() {
        match it {
            Item::Table(s) => set_position(s, pos),
            Item::ArrayOfTables(a) => a.iter_mut().for_each(|s| set_position(s, pos)),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ops(v: Json) -> Vec<PatchOp> {
        serde_json::from_value(v).unwrap()
    }

    fn run(src: &str, v: Json) -> String {
        let out = patch(src, &ops(v)).unwrap();
        parse(&out).unwrap_or_else(|e| panic!("invalid output: {e}\n{out}"));
        out
    }

    const SRC: &str = r#"# Terminux config
font_size = 13 # px

# Profiles
[[profile]]
id = "bash"
name = "Bash"

[profile.font]
face = "Mono"

[[profile]]
id = "zsh" # second
name = "Zsh"

[keys]
"ctrl+t" = "new_tab"
"#;

    #[test]
    fn set_root_key_keeps_comments() {
        let out = run(SRC, json!([{ "op": "set", "path": ["font_size"], "value": 15 }]));
        assert!(out.contains("font_size = 15 # px"), "{out}");
        assert!(out.starts_with("# Terminux config\n"));
        assert!(out.contains("# Profiles\n[[profile]]"));
    }

    #[test]
    fn add_root_key_before_tables() {
        let out = run(SRC, json!([{ "op": "set", "path": ["copy_on_select"], "value": true }]));
        assert!(out.find("copy_on_select = true").unwrap() < out.find("[[profile]]").unwrap(), "{out}");
    }

    #[test]
    fn nested_profile_key() {
        let out = run(SRC, json!([
            { "op": "set", "path": ["profile", 1, "font", "size"], "value": 12.5 },
            { "op": "set", "path": ["profile", 0, "font", "size"], "value": 11 },
        ]));
        let v = parse(&out).unwrap();
        assert_eq!(v["profile"][1]["font"]["size"], json!(12.5));
        assert_eq!(v["profile"][0]["font"], json!({ "face": "Mono", "size": 11 }));
        assert!(out.contains("id = \"zsh\" # second"), "{out}");
    }

    #[test]
    fn remove_prunes_empty_tables() {
        let out = run(SRC, json!([{ "op": "remove", "path": ["profile", 0, "font", "face"] }]));
        assert!(!out.contains("[profile.font]"), "{out}");
        let out = run(SRC, json!([{ "op": "set", "path": ["keys", "ctrl+t"], "value": null }]));
        assert!(!out.contains("[keys]"), "{out}");
        let commented = "# Bindings\n[keys]\nfind = \"Ctrl+F\"\n";
        let out = run(commented, json!([{ "op": "remove", "path": ["keys", "find"] }]));
        assert_eq!(out, "# Bindings\n[keys]\n");
        // Missing paths are a no-op.
        assert_eq!(run(SRC, json!([{ "op": "remove", "path": ["defaults", "font", "size"] }])), SRC);
    }

    #[test]
    fn create_section() {
        let out = run(SRC, json!([{ "op": "set", "path": ["defaults", "font", "size"], "value": 14 }]));
        assert!(out.contains("[defaults.font]\nsize = 14"), "{out}");
        assert!(!out.contains("[defaults]\n"), "{out}");
    }

    #[test]
    fn quoted_keys() {
        let out = run(SRC, json!([
            { "op": "set", "path": ["keys", "ctrl+shift+w"], "value": "close_pane" },
            { "op": "set", "path": ["keys", "ctrl+t"], "value": "duplicate_tab" },
        ]));
        assert!(out.contains("\"ctrl+shift+w\" = \"close_pane\""), "{out}");
        assert!(out.contains("\"ctrl+t\" = \"duplicate_tab\""), "{out}");
    }

    #[test]
    fn insert_remove_move_profiles() {
        let out = run(SRC, json!([{ "op": "insert", "path": ["profile"], "index": 1, "value": { "id": "fish", "font": { "size": 10 } } }]));
        let v = parse(&out).unwrap();
        let ids: Vec<_> = v["profile"].as_array().unwrap().iter().map(|p| p["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["bash", "fish", "zsh"]);
        assert!(out.find("id = \"fish\"").unwrap() < out.find("id = \"zsh\"").unwrap(), "{out}");

        let out = run(SRC, json!([{ "op": "move", "path": ["profile"], "from": 0, "to": 1 }]));
        let v = parse(&out).unwrap();
        assert_eq!(v["profile"][1]["font"]["face"], json!("Mono"));
        assert!(out.find("id = \"zsh\"").unwrap() < out.find("id = \"bash\"").unwrap(), "{out}");
        assert!(out.find("id = \"bash\"").unwrap() < out.find("[profile.font]").unwrap(), "{out}");

        let out = run(SRC, json!([{ "op": "remove", "path": ["profile", 0] }]));
        assert!(!out.contains("bash") && !out.contains("[profile.font]"), "{out}");
        assert!(out.contains("[keys]"));
    }

    #[test]
    fn insert_new_array_of_tables_and_values() {
        let out = run(SRC, json!([
            { "op": "insert", "path": ["scheme"], "value": { "name": "Mine", "background": "#000000" } },
            { "op": "insert", "path": ["toolbar"], "value": "new_tab" },
            { "op": "insert", "path": ["toolbar"], "index": 0, "value": "separator" },
        ]));
        let v = parse(&out).unwrap();
        assert_eq!(v["scheme"][0]["name"], json!("Mine"));
        assert_eq!(v["toolbar"], json!(["separator", "new_tab"]));
        assert!(out.contains("[[scheme]]"), "{out}");
    }

    #[test]
    fn inline_tables_stay_inline() {
        let src = "color_scheme = { light = \"A\", dark = \"B\" }\n";
        let out = run(src, json!([{ "op": "set", "path": ["color_scheme", "dark"], "value": "C" }]));
        assert_eq!(parse(&out).unwrap()["color_scheme"], json!({ "light": "A", "dark": "C" }));
        assert!(!out.contains('['), "{out}");
    }

    #[test]
    fn replace_table_with_object() {
        let out = run(SRC, json!([{ "op": "set", "path": ["keys"], "value": { "ctrl+n": "new_window" } }]));
        assert_eq!(parse(&out).unwrap()["keys"], json!({ "ctrl+n": "new_window" }));
        assert!(out.contains("[keys]"), "{out}");
    }

    #[test]
    fn errors() {
        assert!(patch("a = [", &[]).is_err());
        assert!(patch(SRC, &ops(json!([{ "op": "set", "path": ["font_size", "x"], "value": 1 }]))).is_err());
        assert!(patch(SRC, &ops(json!([{ "op": "move", "path": ["profile"], "from": 0, "to": 5 }]))).is_err());
    }
}
