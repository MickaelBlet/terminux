//! Generated profiles: WSL distributions, SSH hosts, PowerShell, Windows shells.
//! Computed once per run; `disabled_profile_sources` filters them at config load.

use std::sync::OnceLock;

#[cfg(windows)]
use toml::Value;

use crate::config::Profile;

static CACHE: OnceLock<Vec<Profile>> = OnceLock::new();

pub fn all() -> &'static [Profile] {
    CACHE.get_or_init(generate)
}

fn generate() -> Vec<Profile> {
    let mut out = Vec::new();
    #[cfg(windows)]
    {
        out.extend(windows_shells());
        out.extend(wsl());
    }
    if let Some(p) = powershell_core() {
        out.push(p);
    }
    out.extend(ssh());
    out
}

fn slug(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn profile(source: &str, id: String, name: String, cmd: &str, args: Vec<String>) -> Profile {
    Profile {
        id,
        name,
        cmd: cmd.into(),
        args,
        // Shells and remote sessions: never wrap in the user's login shell.
        login_shell: Some(false),
        source: Some(source.into()),
        ..Default::default()
    }
}

/// Distribution names from `wsl.exe -l -q` output (UTF-16LE, NUL-padded on old builds).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn parse_wsl_list(bytes: &[u8]) -> Vec<String> {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&units)
        .lines()
        .map(|l| l.trim_matches(|c: char| c.is_whitespace() || c == '\0' || c == '\u{feff}'))
        .filter(|l| !l.is_empty() && !l.starts_with("docker-desktop"))
        .map(str::to_string)
        .collect()
}

#[cfg(windows)]
fn wsl() -> Vec<Profile> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let Ok(out) = std::process::Command::new("wsl.exe")
        .args(["-l", "-q"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    parse_wsl_list(&out.stdout)
        .into_iter()
        .map(|distro| {
            let mut p = profile(
                "wsl",
                format!("wsl-{}", slug(&distro)),
                distro.clone(),
                "wsl.exe",
                vec!["-d".into(), distro, "--cd".into(), "~".into()],
            );
            p.extra.insert("path_translation_style".into(), Value::String("wsl".into()));
            p
        })
        .collect()
}

#[cfg(windows)]
fn windows_shells() -> Vec<Profile> {
    vec![
        profile("windows", "powershell".into(), "Windows PowerShell".into(), "powershell.exe", vec![]),
        profile("windows", "cmd".into(), "Command Prompt".into(), "cmd.exe", vec![]),
    ]
}

fn in_path(exe: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else { return false };
    std::env::split_paths(&path).any(|dir| dir.join(exe).is_file())
}

fn powershell_core() -> Option<Profile> {
    let exe = if cfg!(windows) { "pwsh.exe" } else { "pwsh" };
    in_path(exe).then(|| profile("powershell", "pwsh".into(), "PowerShell".into(), exe, vec![]))
}

/// Concrete host aliases of an OpenSSH client config (patterns and negations skipped).
pub fn parse_ssh_config(src: &str) -> Vec<String> {
    let mut hosts: Vec<String> = Vec::new();
    for line in src.lines() {
        let line = line.trim();
        let (key, rest) = match line.split_once(|c: char| c.is_whitespace() || c == '=') {
            Some(kv) => kv,
            None => continue,
        };
        if !key.eq_ignore_ascii_case("host") {
            continue;
        }
        for h in rest.trim_start_matches(['=', ' ', '\t']).split_whitespace() {
            let h = h.trim_matches('"');
            if h.is_empty() || h.contains(['*', '?', '!']) || hosts.iter().any(|x| x == h) {
                continue;
            }
            hosts.push(h.to_string());
        }
    }
    hosts
}

fn ssh() -> Vec<Profile> {
    let ssh_exe = if cfg!(windows) { "ssh.exe" } else { "ssh" };
    if !in_path(ssh_exe) {
        return Vec::new();
    }
    let Some(home) = dirs::home_dir() else { return Vec::new() };
    let Ok(src) = std::fs::read_to_string(home.join(".ssh").join("config")) else {
        return Vec::new();
    };
    parse_ssh_config(&src)
        .into_iter()
        .map(|host| {
            profile(
                "ssh",
                format!("ssh-{}", slug(&host)),
                format!("SSH - {host}"),
                ssh_exe,
                vec![host],
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wsl_list_utf16() {
        let text = "\u{feff}Ubuntu-22.04\r\nDebian\r\ndocker-desktop-data\r\n\r\n";
        let bytes: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
        assert_eq!(parse_wsl_list(&bytes), ["Ubuntu-22.04", "Debian"]);
    }

    #[test]
    fn ssh_hosts() {
        let src = "# c\nHost *\n  User x\nHost web db-1 !bad\n\tHostName 10.0.0.1\nhost=bastion\nHost \"quoted\" web\nMatch host foo\n";
        assert_eq!(parse_ssh_config(src), ["web", "db-1", "bastion", "quoted"]);
    }

    #[test]
    fn slugs() {
        assert_eq!(slug("Ubuntu-22.04"), "ubuntu-22-04");
        assert_eq!(slug("my host"), "my-host");
    }
}
