//! Git sidebar: run `git` in a pane's directory, locally, on the pane's ssh host or in its WSL
//! distro. Only a fixed set of subcommands and options is accepted from the webview, so it
//! cannot be used to run arbitrary programs (`--upload-pack`, `--exec`, `--output`…).

use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::editor::expand_home;
use crate::ssh::{self, SshTarget};

/// Where git runs.
pub enum Host {
    Local,
    Ssh(SshTarget),
    /// `wsl.exe` and its distro/user selection arguments.
    Wsl(String, Vec<String>),
}

#[derive(Debug, Serialize)]
pub struct Output {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

const SUBCOMMANDS: &[&str] = &[
    "status", "diff", "show", "log", "add", "restore", "reset", "rm", "commit", "branch", "switch",
    "fetch", "pull", "push", "stash", "rev-parse", "for-each-ref", "clean", "init", "revert",
];

/// Options accepted as is.
const FLAGS: &[&str] = &[
    "-", "-z", "-q", "-u", "-a", "-A", "-f", "-d", "-D", "-c", "-n", "-M", "--all", "--branch", "--cached", "--staged",
    "--worktree", "--porcelain=v2", "--untracked-files=all", "--untracked-files=no", "--no-ext-diff", "--patch",
    "--no-color", "--soft", "--mixed", "-F", "--amend", "--no-edit", "--allow-empty", "--detach", "--track",
    "--prune", "--rebase", "--no-rebase", "--ff-only", "--set-upstream", "--force-with-lease", "--include-untracked",
    "--index", "--show-toplevel", "--abbrev-ref", "--verify", "--short", "--git-dir", "--is-inside-work-tree",
    "--root", "--stat", "--no-renames", "--find-renames", "--ignore-submodules", "--first-parent",
];

/// Options taking an inline value (`--format=…`).
const VALUE_FLAGS: &[&str] = &["--format=", "--pretty=", "--sort=", "--max-count=", "--message=", "--unified="];

/// Check the argv (without the leading `git`): known subcommand, then only known options
/// before `--`; anything after `--` is a path.
pub fn validate(args: &[String]) -> Result<(), String> {
    let sub = args.first().ok_or("git: no subcommand")?;
    if !SUBCOMMANDS.contains(&sub.as_str()) {
        return Err(format!("git {sub}: not allowed"));
    }
    for a in &args[1..] {
        if a == "--" {
            break;
        }
        if a.starts_with('-') && !FLAGS.contains(&a.as_str()) && !VALUE_FLAGS.iter().any(|p| a.starts_with(p)) {
            return Err(format!("git {sub} {a}: option not allowed"));
        }
    }
    Ok(())
}

/// Fixed environment: never prompt or open an editor/pager, plain English output.
const ENV: &[(&str, &str)] = &[
    ("GIT_TERMINAL_PROMPT", "0"),
    ("GIT_OPTIONAL_LOCKS", "0"),
    ("GIT_EDITOR", "true"),
    ("GIT_SEQUENCE_EDITOR", "true"),
    ("GIT_PAGER", "cat"),
    ("LC_ALL", "C"),
];

/// Global options before the subcommand.
const GLOBAL: &[&str] = &["-c", "color.ui=false", "-c", "core.quotepath=false", "--no-pager"];

/// Remote shell command: `cd <dir> && env K=V… git …` (works in POSIX shells and fish).
pub fn remote_command(dir: &str, args: &[String]) -> String {
    let env = ENV.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>().join(" ");
    let argv = GLOBAL
        .iter()
        .map(|s| s.to_string())
        .chain(args.iter().cloned())
        .map(|a| ssh::sh_quote(&a))
        .collect::<Vec<_>>()
        .join(" ");
    format!("cd -- {} && env {env} git {argv}", ssh::remote_path_arg(dir))
}

fn command(host: &Host, dir: &str, args: &[String]) -> Command {
    match host {
        Host::Local => {
            let mut cmd = ssh::quiet_command("git");
            cmd.current_dir(expand_home(dir)).args(GLOBAL).args(args).envs(ENV.iter().copied());
            cmd
        }
        Host::Ssh(t) => {
            let mut cmd = ssh::quiet_command(&t.program);
            cmd.args(ssh::exec_args(t, &remote_command(dir, args)));
            cmd
        }
        Host::Wsl(program, sel) => {
            let mut cmd = ssh::quiet_command(program);
            cmd.args(sel).args(["--cd", dir, "--exec", "env"]);
            cmd.args(ENV.iter().map(|(k, v)| format!("{k}={v}")));
            cmd.arg("git").args(GLOBAL).args(args);
            cmd
        }
    }
}

/// Network operations get more time.
fn timeout(args: &[String]) -> Duration {
    match args.first().map(String::as_str) {
        Some("fetch" | "pull" | "push") => Duration::from_secs(120),
        Some("commit") => Duration::from_secs(300), // hooks (lint, tests)
        _ => Duration::from_secs(30),
    }
}

fn drain(mut r: impl Read + Send + 'static) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = r.read_to_end(&mut buf);
        buf
    })
}

fn wait(child: &mut Child, limit: Duration) -> Result<i32, String> {
    let start = Instant::now();
    loop {
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            return Ok(st.code().unwrap_or(-1));
        }
        if start.elapsed() > limit {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("git: timed out after {} s", limit.as_secs()));
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// Run `git <args>` in `dir` on `host`, feeding `stdin` when given.
pub fn run(host: &Host, dir: &str, args: &[String], stdin: Option<String>) -> Result<Output, String> {
    validate(args)?;
    if dir.is_empty() {
        return Err("git: no directory".into());
    }
    let mut cmd = command(host, dir, args);
    cmd.stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| match host {
        Host::Local if e.kind() == std::io::ErrorKind::NotFound => "git is not installed (not found in PATH)".to_string(),
        _ => format!("git: {e}"),
    })?;
    if let (Some(text), Some(mut w)) = (stdin, child.stdin.take()) {
        std::thread::spawn(move || {
            let _ = w.write_all(text.as_bytes());
        });
    }
    let out = drain(child.stdout.take().ok_or("git: no stdout")?);
    let err = drain(child.stderr.take().ok_or("git: no stderr")?);
    let code = wait(&mut child, timeout(args))?;
    let stdout = String::from_utf8_lossy(&out.join().unwrap_or_default()).into_owned();
    let stderr = String::from_utf8_lossy(&err.join().unwrap_or_default()).into_owned();
    Ok(Output { code, stdout, stderr })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn validates_args() {
        assert!(validate(&v(&["status", "--porcelain=v2", "--branch", "-z"])).is_ok());
        assert!(validate(&v(&["log", "--format=%H%x1f%s", "-n", "100"])).is_ok());
        assert!(validate(&v(&["add", "--", "-rf weird", "--output=x"])).is_ok());
        assert!(validate(&v(&["commit", "-F", "-", "--amend"])).is_ok());
        assert!(validate(&v(&[])).is_err());
        assert!(validate(&v(&["config", "core.sshCommand", "x"])).is_err());
        assert!(validate(&v(&["fetch", "--upload-pack=touch /tmp/x"])).is_err());
        assert!(validate(&v(&["push", "--receive-pack", "x"])).is_err());
        assert!(validate(&v(&["diff", "--output=/etc/x"])).is_err());
        assert!(validate(&v(&["diff", "--outp=/etc/x"])).is_err());
        assert!(validate(&v(&["-c", "core.pager=sh", "log"])).is_err());
    }

    #[test]
    fn quotes_remote_command() {
        assert_eq!(
            remote_command("~/my repo", &v(&["add", "--", "it's.txt"])),
            "cd -- ~/'my repo' && env GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0 GIT_EDITOR=true GIT_SEQUENCE_EDITOR=true GIT_PAGER=cat LC_ALL=C \
             git '-c' 'color.ui=false' '-c' 'core.quotepath=false' '--no-pager' 'add' '--' 'it'\\''s.txt'"
        );
    }
}
