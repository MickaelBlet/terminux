//! Path completion for the `open_file` prompt: entry names of one directory, local or on the ssh
//! host of a pane. Only names and the directory flag are returned, never file contents.

use std::process::Stdio;

use crate::ssh::{self, SshTarget};

/// Entries returned for one directory at most.
const MAX: usize = 1000;

#[derive(serde::Serialize, Debug, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub dir: bool,
}

fn finish(mut v: Vec<Entry>) -> Vec<Entry> {
    v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then_with(|| a.name.cmp(&b.name)));
    v.truncate(MAX);
    v
}

/// Entries of a local directory (absolute, or starting with `~`).
pub fn list_local(dir: &str) -> Result<Vec<Entry>, String> {
    let path = if dir.starts_with('~') { crate::config::resolve_path(dir) } else { dir.into() };
    if !path.is_absolute() {
        return Err(format!("{dir}: not an absolute path"));
    }
    let rd = std::fs::read_dir(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let v = rd
        .flatten()
        .take(MAX * 4)
        .map(|e| {
            // Follow symlinks: a link to a directory completes like one.
            let dir = std::fs::metadata(e.path()).map(|m| m.is_dir()).unwrap_or(false);
            Entry { name: e.file_name().to_string_lossy().into_owned(), dir }
        })
        .collect();
    Ok(finish(v))
}

/// Entries of a directory on the ssh host (non-interactive `ssh`, like `scp`).
pub fn list_remote(target: &SshTarget, dir: &str) -> Result<Vec<Entry>, String> {
    let cmd = format!("ls -1ApL -- {}", ssh::remote_path_arg(dir));
    let out = ssh::quiet_command(&target.program)
        .args(ssh::exec_args(target, &cmd))
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("ssh: {e}"))?;
    if !out.status.success() {
        let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(format!("ssh: {}", if msg.is_empty() { "failed" } else { &msg }));
    }
    Ok(parse_ls(&String::from_utf8_lossy(&out.stdout)))
}

/// `ls -1Ap` output: one name per line, directories end with `/`.
fn parse_ls(out: &str) -> Vec<Entry> {
    let v = out
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| match l.strip_suffix('/') {
            Some(n) => Entry { name: n.into(), dir: true },
            None => Entry { name: l.into(), dir: false },
        })
        .collect();
    finish(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ls() {
        let v = parse_ls("b.txt\n.git/\nA/\n");
        assert_eq!(
            v,
            [
                Entry { name: ".git".into(), dir: true },
                Entry { name: "A".into(), dir: true },
                Entry { name: "b.txt".into(), dir: false }
            ]
        );
    }

    #[test]
    fn lists_local() {
        let dir = std::env::temp_dir().join(format!("terminux-complete-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("f"), "").unwrap();
        let v = list_local(&dir.to_string_lossy()).unwrap();
        assert_eq!(v, [Entry { name: "f".into(), dir: false }, Entry { name: "sub".into(), dir: true }]);
        assert!(list_local("relative").is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
