//! Ctrl+click on a file path: open it in the editor named by `file_link_editor`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use crate::config::split_commandline;

/// Expand `~` (paths from the terminal are absolute or home-relative here).
pub fn expand_home(path: &str) -> PathBuf {
    match (path.strip_prefix('~'), dirs::home_dir()) {
        (Some(rest), Some(home)) if rest.is_empty() || rest.starts_with(['/', '\\']) => {
            home.join(rest.trim_start_matches(['/', '\\']))
        }
        _ => PathBuf::from(path),
    }
}

/// Editor argv from a template: `{file}`, `{line}`, `{col}` are substituted per argument
/// (no shell); the file is appended when the template does not mention it.
pub fn expand(template: &str, file: &str, line: Option<u32>, col: Option<u32>) -> Vec<String> {
    let line = line.unwrap_or(1).to_string();
    let col = col.unwrap_or(1).to_string();
    let mut args = split_commandline(template);
    let has_file = args.iter().any(|a| a.contains("{file}"));
    for a in &mut args {
        *a = a.replace("{line}", &line).replace("{col}", &col).replace("{file}", file);
    }
    if !has_file {
        args.push(file.to_string());
    }
    args
}

/// Quote one argument for `split_commandline`.
pub(crate) fn quote_arg(a: &str) -> String {
    if !a.is_empty() && !a.contains([' ', '\t', '"', '\'']) {
        return a.to_string();
    }
    format!("\"{}\"", a.replace('"', "\\\""))
}

/// Commandline of a fallback editor tab: `$VISUAL` / `$EDITOR` / `vi` at the line.
#[cfg(not(windows))]
pub fn fallback_commandline(file: &str, line: Option<u32>) -> String {
    let quoted = format!("\"{}\"", file.replace('"', "\\\""));
    format!("sh -c '${{VISUAL:-${{EDITOR:-vi}}}} +{} \"$1\"' sh {quoted}", line.unwrap_or(1))
}

/// `terminal`: return the commandline of a terminal pane running the editor. Otherwise launch it
/// detached, returning `Some(commandline)` when no editor is configured and a terminal tab should
/// run the fallback instead.
pub fn open(template: Option<&str>, path: &str, line: Option<u32>, col: Option<u32>, terminal: bool) -> Result<Option<String>, String> {
    let path = expand_home(path);
    if !path.is_file() {
        return Err(format!("{}: no such file", path.display()));
    }
    let file = path.to_string_lossy();
    let template = template.filter(|t| !t.trim().is_empty());
    if terminal {
        return match template {
            Some(t) => Ok(Some(expand(t, &file, line, col).iter().map(|a| quote_arg(a)).collect::<Vec<_>>().join(" "))),
            #[cfg(windows)]
            None => Err("set file_link_editor to open files in a terminal pane".into()),
            #[cfg(not(windows))]
            None => Ok(Some(fallback_commandline(&file, line))),
        };
    }
    let args = match template {
        Some(t) => expand(t, &file, line, col),
        #[cfg(windows)]
        None => vec!["notepad.exe".into(), file.to_string()],
        #[cfg(not(windows))]
        None => return Ok(Some(fallback_commandline(&file, line))),
    };
    let (program, rest) = args.split_first().ok_or("file_link_editor is empty")?;
    spawn_detached(&resolve_program(program), rest).map_err(|e| format!("{program}: {e}"))?;
    Ok(None)
}

fn spawn_detached(program: &Path, args: &[String]) -> std::io::Result<()> {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn()?;
    // Reap it so it does not linger as a zombie.
    std::thread::spawn(move || child.wait());
    Ok(())
}

/// Windows: `Command` only appends `.exe`; find `code.cmd` & co through `PATHEXT`
/// (std then quotes `.cmd`/`.bat` arguments safely).
#[cfg(windows)]
fn resolve_program(program: &str) -> PathBuf {
    let p = Path::new(program);
    if p.extension().is_some() || p.components().count() > 1 {
        return p.to_path_buf();
    }
    let exts = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        for ext in exts.split(';').filter(|e| !e.is_empty()) {
            let c = dir.join(format!("{program}{}", ext.to_lowercase()));
            if c.is_file() {
                return c;
            }
        }
    }
    p.to_path_buf()
}

#[cfg(not(windows))]
fn resolve_program(program: &str) -> PathBuf {
    PathBuf::from(program)
}

/// Largest file the built-in editor opens.
const MAX_TEXT: u64 = 8 << 20;

/// Files opened in the built-in editor (Ctrl+click); only those can be written back.
#[derive(Default)]
pub struct OpenFiles(Mutex<HashSet<PathBuf>>);

#[derive(serde::Serialize)]
pub struct TextFile {
    path: String,
    text: String,
}

impl OpenFiles {
    pub fn read(&self, path: &str) -> Result<TextFile, String> {
        let path = expand_home(path);
        let path = path.canonicalize().map_err(|e| format!("{}: {e}", path.display()))?;
        let meta = std::fs::metadata(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        if !meta.is_file() {
            return Err(format!("{}: not a file", path.display()));
        }
        if meta.len() > MAX_TEXT {
            return Err(format!("{}: file too large", path.display()));
        }
        let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        let text = String::from_utf8(bytes).map_err(|_| format!("{}: not a UTF-8 text file", path.display()))?;
        let shown = path.to_string_lossy().trim_start_matches(r"\\?\").to_string();
        self.0.lock().unwrap().insert(path);
        Ok(TextFile { path: shown, text })
    }

    pub fn write(&self, path: &str, text: &str) -> Result<(), String> {
        let path = Path::new(path).canonicalize().map_err(|e| format!("{path}: {e}"))?;
        if !self.0.lock().unwrap().contains(&path) {
            return Err(format!("{}: not opened in the editor", path.display()));
        }
        std::fs::write(&path, text).map_err(|e| format!("{}: {e}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_template() {
        assert_eq!(
            expand("code --goto \"{file}:{line}:{col}\"", "/a b/c.rs", Some(3), None),
            ["code", "--goto", "/a b/c.rs:3:1"]
        );
        assert_eq!(expand("subl -n", "/x", None, None), ["subl", "-n", "/x"]);
        assert_eq!(expand("vim +{line} {file}", "/x", Some(9), Some(2)), ["vim", "+9", "/x"]);
    }

    #[cfg(not(windows))]
    #[test]
    fn fallback_quotes_the_file() {
        let line = fallback_commandline("/a \"b\".rs", Some(4));
        assert_eq!(
            split_commandline(&line),
            ["sh", "-c", "${VISUAL:-${EDITOR:-vi}} +4 \"$1\"", "sh", "/a \"b\".rs"]
        );
    }

    #[test]
    fn rejects_missing_files() {
        assert!(open(Some("true"), "/definitely/not/here.txt", None, None, false).is_err());
    }

    #[test]
    fn terminal_commandline_round_trips() {
        let f = std::env::temp_dir().join("terminux editor test.txt");
        std::fs::write(&f, "x").unwrap();
        let line = open(Some("nvim +{line} {file}"), &f.to_string_lossy(), Some(3), None, true).unwrap().unwrap();
        assert_eq!(split_commandline(&line), ["nvim", "+3", &*f.to_string_lossy()]);
        std::fs::remove_file(f).unwrap();
    }

    #[test]
    fn writes_only_opened_files() {
        let dir = std::env::temp_dir();
        let (a, b) = (dir.join("terminux-open-a.txt"), dir.join("terminux-open-b.txt"));
        std::fs::write(&a, "a").unwrap();
        std::fs::write(&b, "b").unwrap();
        let files = OpenFiles::default();
        let doc = files.read(&a.to_string_lossy()).unwrap();
        assert_eq!(doc.text, "a");
        files.write(&doc.path, "A").unwrap();
        assert_eq!(std::fs::read_to_string(&a).unwrap(), "A");
        assert!(files.write(&b.to_string_lossy(), "B").is_err());
        std::fs::remove_file(a).unwrap();
        std::fs::remove_file(b).unwrap();
    }
}
