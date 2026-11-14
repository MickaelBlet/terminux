//! `wt`-compatible command line: `terminux [options] [command ; command ...]`.
//! Commands become frontend actions (JSON, same shape as `[[action]]`).

use std::path::Path;

use serde::Serialize;
use serde_json::{Map, Value, json};

#[derive(Debug, Default, Clone, Serialize, PartialEq)]
pub struct Cli {
    /// `-w`: window id, name, "new" / "-1", "last" / "0".
    pub window: Option<String>,
    pub maximized: bool,
    pub fullscreen: bool,
    pub focus: bool,
    /// `--pos x,y` (either may be omitted).
    pub pos: Option<(Option<i32>, Option<i32>)>,
    /// `--size cols,rows`.
    pub size: Option<(u32, u32)>,
    pub actions: Vec<Value>,
    pub help: bool,
}

pub const HELP: &str = "\
Usage: terminux [options] [command [; command]...]

Options:
  -h, --help              Show this help
  -M, --maximized         Launch maximized
  -F, --fullscreen        Launch fullscreen
  -f, --focus             Launch in focus mode (no tab bar)
  --pos x,y               Window position
  --size cols,rows        Window size in characters
  -w, --window <id|name>  Target window (new / -1, last / 0)

Commands:
  new-tab, nt     [-p profile] [-d dir] [--title t] [--tabColor c] [--colorScheme s]
                  [--suppressApplicationTitle | --useApplicationTitle] [commandline]
  split-pane, sp  [-H | -V] [-s size] [-D] [same options as new-tab] [commandline]
  focus-tab, ft   [-t index | -n | -p]
  move-focus, mf  left|right|up|down|previous|nextInOrder|previousInOrder|first|parent|child
  move-pane, mp   -t index
  swap-pane       left|right|up|down|previous|nextInOrder|previousInOrder|first
";

/// `nextInOrder` / `next-in-order` → `next_in_order`.
fn snake(s: &str) -> String {
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.push(c.to_ascii_lowercase());
        } else if c == '-' {
            out.push('_');
        } else {
            out.push(c);
        }
    }
    out
}

/// Re-join arguments into one command line (quoted where needed, re-split by the backend).
fn join(args: &[String]) -> String {
    args.iter()
        .map(|a| {
            if a.is_empty() || a.chars().any(|c| c.is_whitespace() || c == '"' || c == '\'') {
                format!("\"{}\"", a.replace('"', "\\\""))
            } else {
                a.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Split argv on `;` separators (standalone, or glued at the end of an argument).
fn segments(args: &[String]) -> Vec<Vec<String>> {
    let mut out = vec![Vec::new()];
    for a in args {
        if a == ";" {
            out.push(Vec::new());
        } else if let Some(stripped) = a.strip_suffix(';').filter(|_| !a.ends_with("\\;")) {
            if !stripped.is_empty() {
                out.last_mut().unwrap().push(stripped.to_string());
            }
            out.push(Vec::new());
        } else {
            out.last_mut().unwrap().push(a.replace("\\;", ";"));
        }
    }
    out
}

fn value<'a>(it: &mut std::slice::Iter<'a, String>, flag: &str) -> Result<&'a String, String> {
    it.next().ok_or_else(|| format!("{flag} needs a value"))
}

/// new-tab / split-pane arguments.
fn pane_command(command: &str, args: &[String]) -> Result<Value, String> {
    let split = command == "split_pane";
    let mut m = Map::new();
    m.insert("command".into(), json!(command));
    let mut it = args.iter();
    let mut rest: Vec<String> = Vec::new();
    while let Some(a) = it.next() {
        if !rest.is_empty() || !a.starts_with('-') || a == "-" {
            rest.push(a.clone());
            rest.extend(it.by_ref().cloned());
            break;
        }
        match a.as_str() {
            "-p" | "--profile" => _ = m.insert("profile".into(), json!(value(&mut it, a)?)),
            "-d" | "--startingDirectory" => _ = m.insert("starting_directory".into(), json!(value(&mut it, a)?)),
            "--title" => _ = m.insert("tab_title".into(), json!(value(&mut it, a)?)),
            "--tabColor" => _ = m.insert("tab_color".into(), json!(value(&mut it, a)?)),
            "--colorScheme" => _ = m.insert("color_scheme".into(), json!(value(&mut it, a)?)),
            "--suppressApplicationTitle" => _ = m.insert("suppress_application_title".into(), json!(true)),
            "--useApplicationTitle" => _ = m.insert("suppress_application_title".into(), json!(false)),
            "--appendCommandLine" | "--inheritEnvironment" | "--reloadEnvironment" => {}
            "--" => {
                rest.extend(it.by_ref().cloned());
                break;
            }
            "-H" | "--horizontal" if split => _ = m.insert("split".into(), json!("down")),
            "-V" | "--vertical" if split => _ = m.insert("split".into(), json!("right")),
            "-D" | "--duplicate" if split => _ = m.insert("split_mode".into(), json!("duplicate")),
            "-s" | "--size" if split => {
                let v = value(&mut it, a)?;
                let size: f64 = v.parse().map_err(|_| format!("invalid size {v}"))?;
                m.insert("size".into(), json!(size));
            }
            _ => return Err(format!("unknown option {a}")),
        }
    }
    if split && !m.contains_key("split") {
        m.insert("split".into(), json!("auto"));
    }
    if !rest.is_empty() {
        m.insert("commandline".into(), json!(join(&rest)));
    }
    Ok(Value::Object(m))
}

fn direction(args: &[String], name: &str) -> Result<String, String> {
    let d = args.first().ok_or_else(|| format!("{name} needs a direction"))?;
    Ok(snake(d))
}

fn command(seg: &[String]) -> Result<Option<Value>, String> {
    let Some(first) = seg.first() else { return Ok(None) };
    let rest = &seg[1..];
    Ok(Some(match first.as_str() {
        "new-tab" | "nt" => pane_command("new_tab", rest)?,
        "split-pane" | "sp" => pane_command("split_pane", rest)?,
        "focus-tab" | "ft" => {
            let mut it = rest.iter();
            match it.next().map(String::as_str) {
                Some("-n" | "--next") => json!({ "command": "next_tab", "tab_switcher_mode": "disabled" }),
                Some("-p" | "--previous") => json!({ "command": "prev_tab", "tab_switcher_mode": "disabled" }),
                Some(f @ ("-t" | "--target")) => {
                    let v = value(&mut it, f)?;
                    json!({ "command": "switch_to_tab", "index": v.parse::<i64>().map_err(|_| format!("invalid tab index {v}"))? })
                }
                _ => return Err("focus-tab needs -t <index>, -n or -p".into()),
            }
        }
        "move-focus" | "mf" => json!({ "command": "move_focus", "direction": direction(rest, "move-focus")? }),
        "swap-pane" => json!({ "command": "swap_pane", "direction": direction(rest, "swap-pane")? }),
        "move-pane" | "mp" => {
            let mut it = rest.iter();
            match it.next().map(String::as_str) {
                Some(f @ ("-t" | "--tab")) => {
                    let v = value(&mut it, f)?;
                    json!({ "command": "move_pane", "index": v.parse::<i64>().map_err(|_| format!("invalid tab index {v}"))? })
                }
                _ => return Err("move-pane needs -t <index>".into()),
            }
        }
        // No subcommand: an implicit new-tab (`terminux -p python`, `terminux htop`).
        _ => pane_command("new_tab", seg)?,
    }))
}

fn parse_pair(v: &str) -> (Option<i64>, Option<i64>) {
    let (a, b) = v.split_once(',').unwrap_or((v, ""));
    (a.trim().parse().ok(), b.trim().parse().ok())
}

/// Parse arguments (without the program name).
pub fn parse(args: &[String]) -> Result<Cli, String> {
    let mut cli = Cli::default();
    let mut i = 0;
    while i < args.len() {
        let a = args[i].as_str();
        let next = || args.get(i + 1).cloned().ok_or_else(|| format!("{a} needs a value"));
        match a {
            "-h" | "--help" | "-?" | "/?" => cli.help = true,
            "-M" | "--maximized" => cli.maximized = true,
            "-F" | "--fullscreen" => cli.fullscreen = true,
            "-f" | "--focus" => cli.focus = true,
            "-w" | "--window" => {
                cli.window = Some(next()?);
                i += 1;
            }
            "--pos" => {
                let (x, y) = parse_pair(&next()?);
                cli.pos = Some((x.map(|v| v as i32), y.map(|v| v as i32)));
                i += 1;
            }
            "--size" => {
                let v = next()?;
                match parse_pair(&v) {
                    (Some(c), Some(r)) if c > 0 && r > 0 => cli.size = Some((c as u32, r as u32)),
                    _ => return Err(format!("invalid size {v}")),
                }
                i += 1;
            }
            _ => break,
        }
        i += 1;
    }
    for seg in segments(&args[i..]) {
        if let Some(action) = command(&seg)? {
            cli.actions.push(action);
        }
    }
    Ok(cli)
}

/// Parse a single command-line string (palette, `startup_actions`).
pub fn parse_line(line: &str) -> Result<Cli, String> {
    // Keep `;` as its own token even when glued to quotes.
    let args = crate::config::split_commandline(line);
    parse(&args)
}

/// Resolve relative `-d` paths against the invocation directory.
pub fn resolve_dirs(actions: &mut [Value], cwd: &Path) {
    for a in actions {
        if let Some(d) = a.get("starting_directory").and_then(Value::as_str) {
            let p = Path::new(d);
            if p.is_relative() && !d.starts_with('~') {
                a["starting_directory"] = json!(cwd.join(p).to_string_lossy());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &str) -> Vec<String> {
        crate::config::split_commandline(s)
    }

    #[test]
    fn options_and_commands() {
        let cli = parse(&args(r#"-M -w 2 --size 100,30 nt -p python --title "My tab" ; sp -H -s .3 -d src htop -d ; ft -t 0 ; mf nextInOrder"#)).unwrap();
        assert!(cli.maximized);
        assert_eq!(cli.window.as_deref(), Some("2"));
        assert_eq!(cli.size, Some((100, 30)));
        assert_eq!(cli.actions[0], json!({ "command": "new_tab", "profile": "python", "tab_title": "My tab" }));
        assert_eq!(cli.actions[1], json!({ "command": "split_pane", "split": "down", "size": 0.3, "starting_directory": "src", "commandline": "htop -d" }));
        assert_eq!(cli.actions[2], json!({ "command": "switch_to_tab", "index": 0 }));
        assert_eq!(cli.actions[3], json!({ "command": "move_focus", "direction": "next_in_order" }));
    }

    #[test]
    fn implicit_new_tab() {
        let cli = parse(&args("ping example.com")).unwrap();
        assert_eq!(cli.actions, [json!({ "command": "new_tab", "commandline": "ping example.com" })]);
        let cli = parse(&args(r#"-p "Ubuntu 22" ; split-pane"#)).unwrap();
        assert_eq!(cli.actions[0], json!({ "command": "new_tab", "profile": "Ubuntu 22" }));
        assert_eq!(cli.actions[1], json!({ "command": "split_pane", "split": "auto" }));
        assert!(parse(&[]).unwrap().actions.is_empty());
    }

    #[test]
    fn separators() {
        let cli = parse(&args("nt; nt ; sp -V cmd /k dir")).unwrap();
        assert_eq!(cli.actions.len(), 3);
        assert_eq!(cli.actions[2]["commandline"], "cmd /k dir");
        assert_eq!(cli.actions[2]["split"], "right");
        let cli = parse(&args(r"nt sh -c a\;b")).unwrap();
        assert_eq!(cli.actions[0]["commandline"], "sh -c a;b");
    }

    #[test]
    fn errors_and_dirs() {
        assert!(parse(&args("nt --bogus")).is_err());
        assert!(parse(&args("ft")).is_err());
        assert!(parse(&args("--size 0,3")).is_err());
        let mut cli = parse(&args("nt -d sub ; nt -d /abs ; nt -d ~/x")).unwrap();
        resolve_dirs(&mut cli.actions, Path::new("/base"));
        assert_eq!(cli.actions[0]["starting_directory"], "/base/sub");
        assert_eq!(cli.actions[1]["starting_directory"], "/abs");
        assert_eq!(cli.actions[2]["starting_directory"], "~/x");
        assert_eq!(snake("previousInOrder"), "previous_in_order");
    }
}
