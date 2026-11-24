//! SSH panes: detect the destination of a running `ssh`, reopen it in another directory and
//! copy files with `scp`. Options only ever come from a command the user launched.

/// Destination and connection options of an interactive `ssh` session.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SshTarget {
    /// The ssh client as launched (`ssh.exe` matters on Windows: a bare `ssh` would go through
    /// `cmd.exe /c`, which mangles the remote command).
    pub program: String,
    pub dest: String,
    /// Connection options as `(flag, value)`; `value` is empty for boolean flags.
    pub opts: Vec<(char, String)>,
    /// Remote command starting the shell (`ssh -t host /path/zsh`); `None` for the login shell.
    pub shell: Option<String>,
}

/// ssh flags taking a value.
const VALUE_FLAGS: &str = "BbcDEeFIiJLlmOoPpQRSWw";
/// Flags kept when reopening the session (forwards, background and mux control are dropped).
const KEEP_VALUE: &str = "bcFiJlmopS";
const KEEP_BOOL: &str = "46AaCgKkXxY";
/// Flags that make the session non-interactive (no shell to follow).
const NO_SHELL: &str = "fGNOQsVW";

/// Is `program` (a path or a bare name) the ssh client?
pub fn is_ssh_program(program: &str) -> bool {
    let name = program.rsplit(['/', '\\']).next().unwrap_or(program);
    name.eq_ignore_ascii_case("ssh") || name.eq_ignore_ascii_case("ssh.exe")
}

/// Parse an `ssh` argv (program first). `None` unless it opens an interactive shell.
pub fn parse_ssh_argv(argv: &[String]) -> Option<SshTarget> {
    let (program, args) = argv.split_first()?;
    if !is_ssh_program(program) {
        return None;
    }
    let mut opts = Vec::new();
    let mut dest = None;
    let mut shell = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if dest.is_some() {
            // A remote command: only an interactive shell, or the one `follow_argv` adds, keeps one.
            let rest: Vec<&str> = std::iter::once(a.as_str()).chain(it.map(String::as_str)).collect();
            shell = Some(match follow_shell(&rest) {
                Some(s) => s,
                None => Some(shell_command(&rest)?),
            });
            break;
        }
        if a == "--" {
            dest = Some(it.next()?.clone());
            continue;
        }
        let Some(flags) = a.strip_prefix('-').filter(|f| !f.is_empty()) else {
            dest = Some(a.clone());
            continue;
        };
        for (i, f) in flags.char_indices() {
            if NO_SHELL.contains(f) {
                return None;
            }
            if VALUE_FLAGS.contains(f) {
                let rest = &flags[i + f.len_utf8()..];
                let value = if rest.is_empty() { it.next()?.clone() } else { rest.to_string() };
                if KEEP_VALUE.contains(f) {
                    opts.push((f, value));
                }
                break;
            }
            if KEEP_BOOL.contains(f) {
                opts.push((f, String::new()));
            }
        }
    }
    let dest = dest.filter(|d| !d.is_empty() && !d.starts_with('-'))?;
    Some(SshTarget { program: program.clone(), dest, opts, shell: shell.flatten() })
}

/// Remote shells accepted as an ssh remote command.
const SHELLS: &[&str] = &["sh", "bash", "zsh", "fish", "ksh", "mksh", "dash", "ash", "tcsh", "csh", "nu", "elvish", "xonsh", "pwsh"];

/// `words` (an ssh remote command) joined, if it only starts an interactive shell.
fn shell_command(words: &[&str]) -> Option<String> {
    let safe = |w: &str| !w.is_empty() && w.chars().all(|c| c.is_ascii_alphanumeric() || "_./~+-=".contains(c));
    let (first, args) = words.split_first()?;
    let name = first.rsplit('/').next()?;
    let flags_ok = args.iter().all(|a| a.starts_with('-') && safe(a));
    (safe(first) && !first.starts_with('-') && SHELLS.contains(&name) && flags_ok).then(|| words.join(" "))
}

/// End of the remote command added by `follow_argv`, before the shell.
const FOLLOW_EXEC: &str = " 2>/dev/null; exec ";
/// Login shell started by `follow_argv`.
const LOGIN_SHELL: &str = r#""${SHELL:-sh}" -l"#;

/// The shell of a remote command added by `follow_argv` (`Some(None)`: the login shell).
fn follow_shell(words: &[&str]) -> Option<Option<String>> {
    let [cmd] = words else { return None };
    let (_, sh) = cmd.strip_prefix("cd -- ")?.rsplit_once(FOLLOW_EXEC)?;
    if sh == LOGIN_SHELL {
        return Some(None);
    }
    Some(Some(shell_command(&sh.split(' ').collect::<Vec<_>>())?))
}

/// Quote one argument for the remote POSIX shell.
pub fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// Argv reopening the session, in `dir` when given (falls back to the remote home).
pub fn follow_argv(t: &SshTarget, dir: Option<&str>) -> Vec<String> {
    let mut argv = vec![t.program.clone()];
    for (f, v) in &t.opts {
        argv.push(format!("-{f}"));
        if !v.is_empty() {
            argv.push(v.clone());
        }
    }
    let dir = dir.filter(|d| !d.is_empty());
    if dir.is_some() || t.shell.is_some() {
        argv.push("-t".into());
    }
    argv.push("--".into());
    argv.push(t.dest.clone());
    let shell = t.shell.as_deref().unwrap_or(LOGIN_SHELL);
    match dir {
        Some(dir) => argv.push(format!("cd -- {}{FOLLOW_EXEC}{shell}", sh_quote(dir))),
        None => argv.extend(t.shell.clone()),
    }
    argv
}

/// Remote path as a shell word: quoted, a leading `~` kept outside the quotes so it expands.
pub fn remote_path_arg(path: &str) -> String {
    match path.strip_prefix('~') {
        Some("") => "~/".into(),
        Some(rest) if rest.starts_with('/') => format!("~/{}", sh_quote(rest.trim_start_matches('/'))),
        _ => sh_quote(path),
    }
}

/// Arguments (after the program) running `remote_cmd` non-interactively on the target.
pub fn exec_args(t: &SshTarget, remote_cmd: &str) -> Vec<String> {
    let mut args: Vec<String> = ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5"].map(String::from).into();
    for (f, v) in &t.opts {
        args.push(format!("-{f}"));
        if !v.is_empty() {
            args.push(v.clone());
        }
    }
    args.extend(["--".into(), t.dest.clone(), remote_cmd.into()]);
    args
}

/// A background command (no console window flashing on Windows).
pub fn quiet_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// `scp` arguments copying `remote` (on the target) to or from `local`.
pub fn scp_args(t: &SshTarget, remote: &str, local: &str, upload: bool) -> Result<Vec<String>, String> {
    if remote.is_empty() || remote.starts_with('-') {
        return Err(format!("{remote}: invalid remote path"));
    }
    let mut args: Vec<String> = ["-q", "-o", "BatchMode=yes"].map(String::from).into();
    for (f, v) in &t.opts {
        let (flag, value) = match f {
            'p' => ("-P".to_string(), v.clone()),
            'l' => ("-o".into(), format!("User={v}")),
            'S' => ("-o".into(), format!("ControlPath={v}")),
            'm' => ("-o".into(), format!("MACs={v}")),
            'b' => ("-o".into(), format!("BindAddress={v}")),
            'c' | 'F' | 'i' | 'J' | 'o' => (format!("-{f}"), v.clone()),
            '4' | '6' | 'A' | 'C' => (format!("-{f}"), String::new()),
            _ => continue,
        };
        args.push(flag);
        if !value.is_empty() {
            args.push(value);
        }
    }
    // An IPv6 literal needs brackets in `host:path`.
    let host = match t.dest.rsplit_once('@') {
        Some((user, h)) if h.contains(':') => format!("{user}@[{h}]"),
        None if t.dest.contains(':') => format!("[{}]", t.dest),
        _ => t.dest.clone(),
    };
    let remote = format!("{host}:{remote}");
    args.push("--".into());
    if upload {
        args.extend([local.to_string(), remote]);
    } else {
        args.extend([remote, local.to_string()]);
    }
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::split_commandline;

    fn argv(s: &str) -> Vec<String> {
        s.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn parses_destinations() {
        let t = parse_ssh_argv(&argv("ssh web")).unwrap();
        assert_eq!(t, SshTarget { program: "ssh".into(), dest: "web".into(), opts: vec![], shell: None });
        assert_eq!(parse_ssh_argv(&argv(r"C:\Windows\System32\OpenSSH\ssh.exe h")).unwrap().program, r"C:\Windows\System32\OpenSSH\ssh.exe");
        let t = parse_ssh_argv(&argv("/usr/bin/ssh -p 2222 -l bob -oUser=x -4A host")).unwrap();
        assert_eq!(t.dest, "host");
        assert_eq!(
            t.opts,
            [('p', "2222".into()), ('l', "bob".into()), ('o', "User=x".into()), ('4', "".into()), ('A', "".into())]
        );
        let t = parse_ssh_argv(&argv("ssh -L 8080:localhost:80 -t -p22 u@h")).unwrap();
        assert_eq!((t.dest.as_str(), t.opts), ("u@h", vec![('p', "22".into())]));
        assert_eq!(parse_ssh_argv(&argv("ssh -- h")).unwrap().dest, "h");
    }

    #[test]
    fn rejects_non_interactive() {
        for s in ["ssh h ls", "ssh h zsh;x", "ssh h zsh -c x", "ssh h -zsh", "ssh -N h", "ssh -W x:1 h", "ssh -p", "ssh", "bash", "ssh -O check h"] {
            assert!(parse_ssh_argv(&argv(s)).is_none(), "{s}");
        }
    }

    #[test]
    fn follow_round_trips_through_the_commandline() {
        let t = parse_ssh_argv(&argv("ssh -p 22 h")).unwrap();
        let line = follow_argv(&t, Some("/a b/it's \"x\""))
            .iter()
            .map(|a| crate::editor::quote_arg(a))
            .collect::<Vec<_>>()
            .join(" ");
        let back = split_commandline(&line);
        assert_eq!(back[..6], ["ssh", "-p", "22", "-t", "--", "h"]);
        assert_eq!(back[6], r#"cd -- '/a b/it'\''s "x"' 2>/dev/null; exec "${SHELL:-sh}" -l"#);
        assert_eq!(follow_argv(&t, None), ["ssh", "-p", "22", "--", "h"]);
        // A followed session is itself an ssh session (split of a split, reconnect).
        assert_eq!(parse_ssh_argv(&back).unwrap(), t);
        let mut extra = back.clone();
        extra.push("x".into());
        assert!(parse_ssh_argv(&extra).is_none());
    }

    #[test]
    fn remote_shell_command() {
        let t = parse_ssh_argv(&argv("ssh.exe -t u@h /home/u/.local/bin/zsh")).unwrap();
        assert_eq!((t.dest.as_str(), t.shell.as_deref()), ("u@h", Some("/home/u/.local/bin/zsh")));
        assert_eq!(parse_ssh_argv(&argv("ssh h bash -l")).unwrap().shell.as_deref(), Some("bash -l"));
        assert_eq!(follow_argv(&t, None), ["ssh.exe", "-t", "--", "u@h", "/home/u/.local/bin/zsh"]);
        let back = follow_argv(&t, Some("/d"));
        assert_eq!(back[4], "cd -- '/d' 2>/dev/null; exec /home/u/.local/bin/zsh");
        assert_eq!(parse_ssh_argv(&back).unwrap(), t);
        assert_eq!(parse_ssh_argv(&follow_argv(&t, None)).unwrap(), t);
    }

    #[test]
    fn scp_mapping() {
        let t = parse_ssh_argv(&argv("ssh -p 2 -l u -S /s -i k h")).unwrap();
        assert_eq!(
            scp_args(&t, "/r", "/l", false).unwrap(),
            ["-q", "-o", "BatchMode=yes", "-P", "2", "-o", "User=u", "-o", "ControlPath=/s", "-i", "k", "--", "h:/r", "/l"]
        );
        let up = scp_args(&t, "~/x", "/l", true).unwrap();
        assert_eq!(up[up.len() - 2..], ["/l", "h:~/x"]);
        assert!(scp_args(&t, "-oProxyCommand=x", "/l", false).is_err());
        let v6 = SshTarget { program: "ssh".into(), dest: "u@::1".into(), opts: vec![], shell: None };
        assert_eq!(scp_args(&v6, "/r", "/l", false).unwrap().last().unwrap(), "/l");
        assert!(scp_args(&v6, "/r", "/l", false).unwrap().contains(&"u@[::1]:/r".to_string()));
    }

    #[test]
    fn exec_mapping() {
        let t = parse_ssh_argv(&argv("ssh -p 2 -A h")).unwrap();
        assert_eq!(
            exec_args(&t, "ls"),
            ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-p", "2", "-A", "--", "h", "ls"]
        );
        assert_eq!(remote_path_arg("/a b/"), "'/a b/'");
        assert_eq!(remote_path_arg("~"), "~/");
        assert_eq!(remote_path_arg("~/x'y/"), r"~/'x'\''y/'");
        assert_eq!(remote_path_arg("~bob/x"), "'~bob/x'");
    }
}
