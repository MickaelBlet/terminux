use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};

use crate::config::{Profile, split_commandline};
use crate::ssh::{SshTarget, parse_ssh_argv};

/// Output kept while no window is attached (tab moving between windows).
const BACKLOG_MAX: usize = 8 * 1024 * 1024;
/// A detached session nobody re-attaches within this delay is killed (and its orphan dropped).
const DETACH_TIMEOUT: Duration = Duration::from_secs(60);
/// How long the exit path waits for trailing output once the child is gone. A background job
/// still holding the tty keeps the reader blocked forever.
const DRAIN_TIMEOUT: Duration = Duration::from_millis(500);

/// Where the reader thread delivers output.
#[derive(Default)]
struct Sink {
    channel: Option<Channel<InvokeResponseBody>>,
    backlog: Vec<u8>,
    /// Bytes delivered to the current channel (lets the frontend drain before a hand-off).
    sent: u64,
}

impl Sink {
    fn push(&mut self, data: &[u8]) {
        if let Some(ch) = &self.channel {
            if ch.send(InvokeResponseBody::Raw(data.to_vec())).is_ok() {
                self.sent += data.len() as u64;
                return;
            }
            self.channel = None;
        }
        self.backlog.extend_from_slice(data);
        if self.backlog.len() > BACKLOG_MAX {
            let cut = self.backlog.len() - BACKLOG_MAX;
            self.backlog.drain(..cut);
        }
    }

    fn attach(&mut self, channel: Channel<InvokeResponseBody>) {
        self.sent = 0;
        if !self.backlog.is_empty() {
            let data = std::mem::take(&mut self.backlog);
            self.sent = data.len() as u64;
            let _ = channel.send(InvokeResponseBody::Raw(data));
        }
        self.channel = Some(channel);
    }
}

struct Session {
    /// `None` once the child exited (dropped to unblock the reader on Windows).
    master: Option<Box<dyn MasterPty + Send>>,
    /// Input queue of the writer thread: writes never block the caller (a child that stops
    /// reading its tty would otherwise freeze the UI thread).
    input: Option<Sender<Vec<u8>>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    pid: Option<u32>,
    /// Label of the window showing this session ("" while detached).
    owner: String,
    sink: Arc<Mutex<Sink>>,
    /// Bumped on every detach; the reaper only kills the detach it was started for.
    detach_gen: u64,
    /// Killed by the reaper: no orphan is kept.
    reaped: bool,
    /// The spawned command is an interactive `ssh` (fallback where `/proc` is unavailable).
    spawned_ssh: Option<SshTarget>,
    /// The spawned command is `wsl.exe`: program and distro/user selection arguments.
    spawned_wsl: Option<(String, Vec<String>)>,
}

/// A session that exited while detached: output and exit code wait for the next attach.
struct Orphan {
    backlog: Vec<u8>,
    code: Option<u32>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<u32, Session>>>,
    orphans: Arc<Mutex<HashMap<u32, Orphan>>>,
    next_id: AtomicU32,
}

#[derive(Clone, Serialize)]
struct ExitPayload {
    id: u32,
    code: Option<u32>,
}

#[derive(Clone, Serialize)]
pub struct AttachResult {
    /// The process ended while detached; `code` is its exit code.
    pub exited: bool,
    pub code: Option<u32>,
}

pub struct SpawnRequest {
    pub profile: Profile,
    /// Explicit starting directory (action / CLI / restored session): wins over the profile.
    pub cwd: Option<String>,
    /// Directory inherited from the pane being split: used when the profile sets none.
    pub inherit_cwd: Option<String>,
    /// Replaces the profile's command.
    pub commandline: Option<String>,
    pub env: HashMap<String, String>,
    pub cols: u16,
    pub rows: u16,
    pub owner: String,
}

pub fn user_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("TERMINUX_SHELL").unwrap_or_else(|_| "powershell.exe".into())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
    }
}

fn is_wsl(cmd: &str) -> bool {
    let name = cmd.rsplit(['/', '\\']).next().unwrap_or(cmd).to_ascii_lowercase();
    name == "wsl.exe" || name == "wsl"
}

/// `/home/x` or `~`, not a UNC `//wsl.localhost/...` nor `C:/...`.
fn is_linux_path(p: &str) -> bool {
    p.starts_with('~') || (p.starts_with('/') && !p.starts_with("//"))
}

/// wsl.exe arguments with `--cd <dir>` replacing any existing `--cd`.
/// Distro and user selection (`-d X`, `--distribution X`, `-u X`, `--user X`) of a wsl.exe argv.
fn wsl_selection(args: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "-d" | "--distribution" | "-u" | "--user" => {
                out.push(a.clone());
                out.extend(it.next().cloned());
            }
            "--" | "-e" | "--exec" => break,
            _ => {}
        }
    }
    out
}

fn with_wsl_cd(args: &[String], dir: &str) -> Vec<String> {
    let mut out = vec!["--cd".to_string(), dir.to_string()];
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if matches!(a.as_str(), "--" | "-e" | "--exec") {
            // Command line of the distro: copied verbatim.
            out.push(a.clone());
            out.extend(it.cloned());
            break;
        } else if a == "--cd" {
            it.next();
        } else {
            out.push(a.clone());
        }
    }
    out
}

fn expand_home(p: &str) -> PathBuf {
    match (p.strip_prefix('~'), dirs::home_dir()) {
        (Some(rest), Some(home)) => home.join(rest.trim_start_matches(['/', '\\'])),
        _ => PathBuf::from(p),
    }
}

#[cfg(not(windows))]
fn sh_quote(s: &str) -> String {
    if !s.is_empty()
        && s
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_./=:@%+,".contains(c))
    {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', r"'\''"))
    }
}

/// Build the command line for a profile.
pub fn build_command(profile: &Profile) -> CommandBuilder {
    let shell = user_shell();
    let cmd = if profile.cmd == "$SHELL" || profile.cmd.is_empty() {
        shell.clone()
    } else {
        profile.cmd.clone()
    };
    let is_shell = cmd == shell;

    #[cfg(not(windows))]
    let mut builder = if is_shell || profile.login_shell == Some(false) {
        let mut b = CommandBuilder::new(&cmd);
        b.args(&profile.args);
        b
    } else {
        // Run through an interactive login shell so rc-defined PATH applies.
        let line = std::iter::once(&cmd)
            .chain(&profile.args)
            .map(|s| sh_quote(s))
            .collect::<Vec<_>>()
            .join(" ");
        let mut b = CommandBuilder::new(&shell);
        b.args(["-lic", &format!("exec {line}")]);
        b
    };

    #[cfg(windows)]
    let mut builder = {
        let direct = is_shell
            || profile.login_shell == Some(false)
            || cmd.to_ascii_lowercase().ends_with(".exe");
        if direct {
            let mut b = CommandBuilder::new(&cmd);
            b.args(&profile.args);
            b
        } else {
            // Resolves .cmd/.ps1 shims (npm-installed CLIs).
            let mut b = CommandBuilder::new("cmd.exe");
            b.args(["/d", "/c", &cmd]);
            b.args(&profile.args);
            b
        }
    };

    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    builder.env("TERM_PROGRAM", "terminux");
    builder.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    builder.env("TERMINUX_PROFILE_ID", &profile.id);
    for (k, v) in &profile.env {
        builder.env(k, v);
    }
    builder
}

impl PtyManager {
    pub fn spawn(
        &self,
        app: AppHandle,
        req: SpawnRequest,
        on_data: Channel<InvokeResponseBody>,
    ) -> Result<u32> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: req.rows.max(1),
                cols: req.cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("openpty")?;

        let mut profile = req.profile;
        if let Some(line) = req.commandline.as_deref().filter(|l| !l.trim().is_empty()) {
            let mut parts = split_commandline(line).into_iter();
            profile.cmd = parts.next().unwrap_or_default();
            profile.args = parts.collect();
        }
        // wsl.exe: the directory lives inside the distro (Linux path, unreachable from
        // Windows), so it goes through `--cd`, replacing the generated `--cd ~`.
        let mut req_cwd = req.cwd.as_deref();
        let mut inherit_cwd = req.inherit_cwd.as_deref();
        if is_wsl(&profile.cmd) {
            let dir = req_cwd.or(profile.cwd.is_none().then_some(inherit_cwd).flatten());
            if let Some(dir) = dir.filter(|d| is_linux_path(d)) {
                profile.args = with_wsl_cd(&profile.args, dir);
                req_cwd = None;
                inherit_cwd = None;
            }
        }
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let spawned_wsl = is_wsl(&profile.cmd).then(|| (profile.cmd.clone(), wsl_selection(&profile.args)));
        let spawned_ssh = parse_ssh_argv(&[&[profile.cmd.clone()], &profile.args[..]].concat());
        let mut cmd = build_command(&profile);
        cmd.env("TERMINUX_SESSION", id.to_string());
        for (k, v) in &req.env {
            cmd.env(k, v);
        }
        let cwd = [req_cwd, profile.cwd.as_deref(), inherit_cwd]
            .into_iter()
            .flatten()
            .map(expand_home)
            .find(|p| p.is_dir())
            .or_else(dirs::home_dir);
        if let Some(cwd) = cwd {
            cmd.cwd(cwd);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .with_context(|| format!("spawn `{}`", profile.cmd))?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().context("clone reader")?;
        let mut writer = pair.master.take_writer().context("take writer")?;
        let sink = Arc::new(Mutex::new(Sink { channel: Some(on_data), ..Default::default() }));

        let (input, queue) = mpsc::channel::<Vec<u8>>();
        std::thread::Builder::new()
            .name(format!("pty-write-{id}"))
            .spawn(move || {
                // Ends when the session drops its sender, or the pty is gone.
                for data in queue {
                    if writer.write_all(&data).and_then(|_| writer.flush()).is_err() {
                        break;
                    }
                }
            })?;

        let (drained_tx, drained) = mpsc::channel::<()>();
        let reader_sink = sink.clone();
        std::thread::Builder::new()
            .name(format!("pty-read-{id}"))
            .spawn(move || {
                let mut buf = vec![0u8; 64 * 1024];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => reader_sink.lock().unwrap().push(&buf[..n]),
                    }
                }
                let _ = drained_tx.send(());
            })?;

        self.sessions.lock().unwrap().insert(
            id,
            Session {
                master: Some(pair.master),
                input: Some(input),
                killer: child.clone_killer(),
                pid: child.process_id(),
                owner: req.owner,
                sink: sink.clone(),
                detach_gen: 0,
                reaped: false,
                spawned_ssh,
            spawned_wsl,
            },
        );

        let sessions = self.sessions.clone();
        let orphans = self.orphans.clone();
        let waiter = std::thread::Builder::new()
            .name(format!("pty-wait-{id}"))
            .spawn(move || {
                let code = child.wait().ok().map(|s| s.exit_code());
                // Dropping the master (and the writer) unblocks the reader on Windows (ConPTY).
                // The session stays listed so an attach in the meantime still finds it.
                if let Some(s) = sessions.lock().unwrap().get_mut(&id) {
                    s.master = None;
                    s.input = None;
                }
                let _ = drained.recv_timeout(DRAIN_TIMEOUT);
                // Retire the session and publish the exit atomically w.r.t. `attach`, which
                // holds `sessions` while it looks up orphans.
                let mut sessions = sessions.lock().unwrap();
                let reaped = sessions.remove(&id).is_some_and(|s| s.reaped);
                let mut sink = sink.lock().unwrap();
                if sink.channel.is_none() {
                    if !reaped {
                        let backlog = std::mem::take(&mut sink.backlog);
                        orphans.lock().unwrap().insert(id, Orphan { backlog, code });
                    }
                } else {
                    let _ = app.emit("pty-exit", ExitPayload { id, code });
                }
            });
        if let Err(e) = waiter {
            if let Some(mut s) = self.sessions.lock().unwrap().remove(&id) {
                let _ = s.killer.kill();
            }
            return Err(e.into());
        }

        Ok(id)
    }

    /// Queue input for the pty; never blocks.
    pub fn write(&self, id: u32, data: &[u8]) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        let s = sessions.get(&id).ok_or_else(|| anyhow!("no pty {id}"))?;
        let input = s.input.as_ref().ok_or_else(|| anyhow!("pty {id} exited"))?;
        input.send(data.to_vec()).map_err(|_| anyhow!("pty {id} closed"))
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        let s = sessions.get(&id).ok_or_else(|| anyhow!("no pty {id}"))?;
        let Some(master) = &s.master else { return Ok(()) };
        master.resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn kill(&self, id: u32) {
        if let Some(s) = self.sessions.lock().unwrap().get_mut(&id) {
            let _ = s.killer.kill();
        }
        self.orphans.lock().unwrap().remove(&id);
    }

    pub fn kill_all(&self) {
        for s in self.sessions.lock().unwrap().values_mut() {
            let _ = s.killer.kill();
        }
    }

    /// Kill every session shown by a window (it was destroyed).
    pub fn kill_owned(&self, owner: &str) {
        for s in self.sessions.lock().unwrap().values_mut() {
            if s.owner == owner {
                let _ = s.killer.kill();
            }
        }
    }

    /// Detach every session shown by a window (its webview reloaded): the new page re-attaches
    /// them, and those it does not are reaped after `DETACH_TIMEOUT`.
    pub fn detach_owned(&self, owner: &str) {
        let ids: Vec<u32> = self
            .sessions
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, s)| s.owner == owner)
            .map(|(id, _)| *id)
            .collect();
        for id in ids {
            let _ = self.detach(id);
        }
    }

    /// Stop delivering output (buffered until the next attach). Returns the bytes delivered so far.
    /// A session (or its orphan) nobody attaches within `DETACH_TIMEOUT` is killed and dropped.
    pub fn detach(&self, id: u32) -> Result<u64> {
        let mut sessions = self.sessions.lock().unwrap();
        let s = sessions.get_mut(&id).ok_or_else(|| anyhow!("no pty {id}"))?;
        s.owner.clear();
        s.detach_gen += 1;
        let generation = s.detach_gen;
        let sent = {
            let mut sink = s.sink.lock().unwrap();
            sink.channel = None;
            sink.sent
        };
        drop(sessions);
        let (sessions, orphans) = (self.sessions.clone(), self.orphans.clone());
        std::thread::Builder::new().name(format!("pty-reap-{id}")).spawn(move || {
            std::thread::sleep(DETACH_TIMEOUT);
            let mut sessions = sessions.lock().unwrap();
            match sessions.get_mut(&id) {
                Some(s) if s.owner.is_empty() && s.detach_gen == generation => {
                    s.reaped = true;
                    let _ = s.killer.kill();
                }
                Some(_) => {}
                None => {
                    orphans.lock().unwrap().remove(&id);
                }
            }
        })?;
        Ok(sent)
    }

    /// Deliver output to a new channel, replaying what was buffered.
    pub fn attach(
        &self,
        id: u32,
        owner: String,
        channel: Channel<InvokeResponseBody>,
    ) -> Result<AttachResult> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(s) = sessions.get_mut(&id).filter(|s| !s.reaped) {
            s.owner = owner;
            s.sink.lock().unwrap().attach(channel);
            return Ok(AttachResult { exited: false, code: None });
        }
        // Still holding `sessions`: the exit path moves a session to `orphans` under that lock.
        let orphan = self
            .orphans
            .lock()
            .unwrap()
            .remove(&id)
            .ok_or_else(|| anyhow!("no pty {id}"))?;
        if !orphan.backlog.is_empty() {
            let _ = channel.send(InvokeResponseBody::Raw(orphan.backlog));
        }
        drop(sessions);
        Ok(AttachResult { exited: true, code: orphan.code })
    }

    /// The interactive `ssh` session running in the pty, if any: the foreground process on
    /// Linux, else the spawned command.
    pub fn ssh_target(&self, id: u32) -> Option<SshTarget> {
        let sessions = self.sessions.lock().unwrap();
        let s = sessions.get(&id)?;
        #[cfg(target_os = "linux")]
        {
            let pid = s.master.as_ref()?.process_group_leader().map(|p| p as u32).or(s.pid)?;
            if let Ok(raw) = std::fs::read(format!("/proc/{pid}/cmdline")) {
                let argv: Vec<String> = raw
                    .split(|&b| b == 0)
                    .filter(|a| !a.is_empty())
                    .map(|a| String::from_utf8_lossy(a).into_owned())
                    .collect();
                return parse_ssh_argv(&argv);
            }
        }
        s.spawned_ssh.clone()
    }

    /// The `ssh` session the pty was spawned with (not one typed in a shell).
    pub fn spawned_ssh(&self, id: u32) -> Option<SshTarget> {
        self.sessions.lock().unwrap().get(&id)?.spawned_ssh.clone()
    }

    /// `wsl.exe` and its distro/user selection arguments when the pty runs WSL.
    pub fn wsl_target(&self, id: u32) -> Option<(String, Vec<String>)> {
        self.sessions.lock().unwrap().get(&id)?.spawned_wsl.clone()
    }

    /// Current working directory of the pty's foreground process (Linux only).
    pub fn cwd(&self, id: u32) -> Option<String> {
        #[cfg(target_os = "linux")]
        {
            let sessions = self.sessions.lock().unwrap();
            let s = sessions.get(&id)?;
            let pid = s.master.as_ref()?.process_group_leader().map(|p| p as u32).or(s.pid)?;
            std::fs::read_link(format!("/proc/{pid}/cwd"))
                .ok()
                .map(|p| p.to_string_lossy().into_owned())
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = id;
            None
        }
    }
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn wsl_cd_replaces_existing() {
        let v = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(is_linux_path("/home/a") && is_linux_path("~") && !is_linux_path("//wsl.localhost/U/home") && !is_linux_path("C:/x"));
        assert!(is_wsl("wsl.exe") && is_wsl(r"C:\Windows\System32\WSL.EXE") && !is_wsl("bash"));
        assert_eq!(with_wsl_cd(&v(&["-d", "Ubuntu", "--cd", "~"]), "/srv/x"), v(&["--cd", "/srv/x", "-d", "Ubuntu"]));
        assert_eq!(with_wsl_cd(&v(&["-e", "ls", "--cd", "y"]), "/a"), v(&["--cd", "/a", "-e", "ls", "--cd", "y"]));
        assert_eq!(wsl_selection(&v(&["--cd", "~", "-d", "Ubuntu", "-u", "me", "-e", "-d", "x"])), v(&["-d", "Ubuntu", "-u", "me"]));
    }

    #[test]
    fn quoting() {
        assert_eq!(sh_quote("python3"), "python3");
        assert_eq!(sh_quote("a b"), "'a b'");
        assert_eq!(sh_quote("it's"), r"'it'\''s'");
        assert_eq!(sh_quote(""), "''");
    }

    #[test]
    fn program_runs_through_login_shell() {
        let cfg = crate::config::Config::parse(
            "[[profile]]\nid = \"py\"\ncmd = \"python3\"\nargs = [\"-m\", \"http.server\"]",
        )
        .unwrap();
        let p = cfg.profile("py").unwrap().clone();
        let argv = build_command(&p).get_argv().clone();
        assert_eq!(argv[1], "-lic");
        assert_eq!(argv[2], "exec python3 -m http.server");
    }

    #[test]
    fn backlog_is_bounded() {
        let mut sink = Sink::default();
        sink.push(&vec![1u8; BACKLOG_MAX]);
        sink.push(&[2u8; 16]);
        assert_eq!(sink.backlog.len(), BACKLOG_MAX);
        assert_eq!(sink.backlog[BACKLOG_MAX - 1], 2);
    }
}
