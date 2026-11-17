//! Files of an ssh host opened in the built-in editor: copied with `scp` to a local cache file,
//! uploaded back when that file is saved. Only fetched files can be uploaded.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use crate::ssh::{SshTarget, scp_args};

#[derive(Default)]
pub struct RemoteFiles(Mutex<HashMap<PathBuf, (SshTarget, String)>>);

#[derive(serde::Serialize)]
pub struct Fetched {
    /// Local copy (open it with `file_read`).
    local: String,
    /// `host:path`, shown instead of the local path.
    label: String,
}

fn cache_root() -> Result<PathBuf, String> {
    let base = dirs::cache_dir().or_else(|| Some(std::env::temp_dir())).ok_or("no cache directory")?;
    Ok(base.join("terminux").join("remote"))
}

fn create_private_dir(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
    }
    Ok(())
}

fn run_scp(args: &[String]) -> Result<(), String> {
    let mut cmd = Command::new(if cfg!(windows) { "scp.exe" } else { "scp" });
    cmd.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        // No console window flashing for each copy.
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| format!("scp: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let hint = if msg.contains("Permission denied") || msg.contains("Host key verification failed") {
        " (scp runs non-interactively: use a key/agent or a ControlMaster connection)"
    } else {
        ""
    };
    Err(format!("scp: {}{hint}", if msg.is_empty() { "failed" } else { &msg }))
}

impl RemoteFiles {
    /// Copy `remote` from the target into the cache.
    pub fn fetch(&self, target: SshTarget, remote: &str) -> Result<Fetched, String> {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        (&target.dest, remote).hash(&mut h);
        let root = cache_root()?;
        create_private_dir(&root)?;
        let dir = root.join(format!("{:016x}", h.finish()));
        create_private_dir(&dir)?;
        // Keep the name: the editor picks the language from it.
        let name = remote.rsplit('/').find(|s| !s.is_empty()).unwrap_or("file");
        let name = name.replace(['\\', ':'], "_");
        let local = dir.join(&name);
        run_scp(&scp_args(&target, remote, &local.to_string_lossy(), false)?)?;
        if !local.is_file() {
            return Err(format!("{}:{remote}: not a file", target.dest));
        }
        let key = local.canonicalize().map_err(|e| format!("{}: {e}", local.display()))?;
        let label = format!("{}:{remote}", target.dest);
        self.0.lock().unwrap().insert(key, (target, remote.to_string()));
        Ok(Fetched { local: local.to_string_lossy().into_owned(), label })
    }

    /// After `path` was saved: upload it if it is a fetched remote file.
    pub fn upload(&self, path: &str) -> Result<(), String> {
        let Ok(key) = Path::new(path).canonicalize() else { return Ok(()) };
        let Some((target, remote)) = self.0.lock().unwrap().get(&key).cloned() else {
            // A copy restored from an earlier run: the ssh session it came from is gone.
            return match cache_root() {
                Ok(root) if key.starts_with(root.canonicalize().unwrap_or_else(|_| root.clone())) => {
                    Err("saved locally only: reopen the file from its ssh pane to upload".into())
                }
                _ => Ok(()),
            };
        };
        run_scp(&scp_args(&target, &remote, &key.to_string_lossy(), true)?)
    }
}
