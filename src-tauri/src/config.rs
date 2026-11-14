use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use toml::{Table, Value};

use crate::dynamic_profiles;

pub const DEFAULT_CONFIG: &str = include_str!("default_config.toml");

/// `"a"` or `["a", "b"]`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum OneOrMany {
    One(String),
    Many(Vec<String>),
}

/// Spawn-related fields are typed; appearance settings pass through to the frontend in `extra`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub cmd: String,
    /// Alternative to `cmd` + `args`: a full command line, split on parse.
    #[serde(default, skip_serializing)]
    pub commandline: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default, alias = "starting_directory")]
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub os: Option<String>,
    #[serde(default)]
    pub login_shell: Option<bool>,
    #[serde(default)]
    pub hidden: bool,
    /// Generator of a dynamic profile ("wsl", "ssh", ...). Not user-settable.
    #[serde(default, skip_deserializing)]
    pub source: Option<String>,
    #[serde(flatten)]
    pub extra: Table,
}

fn default_profile() -> String {
    "shell".into()
}
fn default_font_size() -> f32 {
    14.0
}
fn default_scrollback() -> u32 {
    10_000
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_profile")]
    pub default_profile: String,
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(default = "default_scrollback")]
    pub scrollback: u32,
    #[serde(default = "default_true")]
    pub notifications: bool,
    #[serde(default)]
    pub copy_on_select: bool,
    #[serde(default = "default_true")]
    pub middle_click_paste: bool,
    #[serde(default = "default_true")]
    pub right_click_paste: bool,
    /// Characters delimiting a word on double-click selection.
    #[serde(default, alias = "word_delimiters")]
    pub word_separators: Option<String>,
    /// "webgl" | "canvas" | "dom".
    #[serde(default)]
    pub renderer: Option<String>,
    /// Settings applied to every profile.
    #[serde(default)]
    pub defaults: Table,
    #[serde(default, rename(deserialize = "profile"))]
    pub profiles: Vec<Profile>,
    #[serde(default, rename(deserialize = "scheme"))]
    pub schemes: Vec<Table>,
    #[serde(default, rename(deserialize = "ui_theme"))]
    pub ui_themes: Vec<Table>,
    #[serde(default, rename(deserialize = "action"))]
    pub actions: Vec<Table>,
    #[serde(default)]
    pub keys: HashMap<String, OneOrMany>,
    #[serde(default)]
    pub theme: HashMap<String, String>,
    #[serde(default)]
    pub disabled_profile_sources: Vec<String>,
    /// Every other global setting, interpreted by the frontend (or read with the getters below).
    #[serde(flatten)]
    pub extra: Table,
    /// Parse error of the user file, if any (defaults are used instead).
    #[serde(default, skip_deserializing)]
    pub error: Option<String>,
}

/// Serialized field names that must not also appear in `extra`.
const RESERVED: [&str; 5] = ["profiles", "schemes", "ui_themes", "actions", "error"];

impl Config {
    /// Parse a config source. Pure: no dynamic profiles, no fragments.
    pub fn parse(src: &str) -> Result<Self, toml::de::Error> {
        let mut cfg: Config = toml::from_str(src)?;
        for k in RESERVED {
            cfg.extra.remove(k);
        }
        cfg.normalize();
        Ok(cfg)
    }

    fn normalize(&mut self) {
        let os = std::env::consts::OS;
        self.profiles
            .retain(|p| p.os.as_deref().is_none_or(|o| o.eq_ignore_ascii_case(os)));
        if !self.profiles.iter().any(|p| p.id == "shell") {
            self.profiles.insert(0, shell_profile());
        }
        let d_cwd = ["cwd", "starting_directory"]
            .iter()
            .find_map(|k| self.defaults.get(*k).and_then(Value::as_str))
            .map(str::to_string);
        let d_env: HashMap<String, String> = self
            .defaults
            .get("env")
            .and_then(Value::as_table)
            .map(|t| {
                t.iter()
                    .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                    .collect()
            })
            .unwrap_or_default();
        let d_login = self.defaults.get("login_shell").and_then(Value::as_bool);
        for p in &mut self.profiles {
            p.normalize();
            if p.cwd.is_none() {
                p.cwd.clone_from(&d_cwd);
            }
            for (k, v) in &d_env {
                p.env.entry(k.clone()).or_insert_with(|| v.clone());
            }
            if p.login_shell.is_none() {
                p.login_shell = d_login;
            }
        }
    }

    pub fn defaults() -> Self {
        Self::parse(DEFAULT_CONFIG).expect("default config is valid")
    }

    pub fn profile(&self, id: &str) -> Option<&Profile> {
        self.profiles.iter().find(|p| p.id == id)
    }

    /// Profile by id, then by display name (CLI `-p`).
    pub fn profile_by_id_or_name(&self, key: &str) -> Option<&Profile> {
        self.profile(key)
            .or_else(|| self.profiles.iter().find(|p| p.name.eq_ignore_ascii_case(key)))
    }

    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.extra.get(key).and_then(Value::as_str)
    }

    pub fn get_bool(&self, key: &str) -> bool {
        self.extra.get(key).and_then(Value::as_bool).unwrap_or(false)
    }

    pub fn get_int(&self, key: &str) -> Option<i64> {
        self.extra.get(key).and_then(Value::as_integer)
    }

    /// True when any profile (or the defaults) asks for a see-through background.
    pub fn wants_transparency(&self) -> bool {
        let below = |t: &Table| {
            let f = |t: &Table| match t.get("opacity") {
                Some(Value::Integer(i)) => *i < 100,
                Some(Value::Float(f)) => *f < 100.0,
                _ => false,
            };
            f(t) || t.get("unfocused_appearance").and_then(Value::as_table).is_some_and(f)
        };
        below(&self.defaults) || self.profiles.iter().any(|p| below(&p.extra))
    }

    /// Add generated profiles and fragment files.
    fn extend(mut self, dir: Option<&Path>) -> Self {
        if let Some(dir) = dir {
            self.load_fragments(&dir.join("fragments"));
        }
        let disabled = self.disabled_profile_sources.clone();
        for generated in dynamic_profiles::all() {
            let source = generated.source.clone().unwrap_or_default();
            if disabled.iter().any(|d| d.eq_ignore_ascii_case(&source)) {
                continue;
            }
            match self.profiles.iter_mut().find(|p| p.id == generated.id) {
                Some(user) => user.inherit(generated),
                None => self.profiles.push(generated.clone()),
            }
        }
        self
    }

    fn load_fragments(&mut self, dir: &Path) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        let mut files: Vec<PathBuf> = entries
            .filter_map(|e| Some(e.ok()?.path()))
            .filter(|p| p.extension().is_some_and(|e| e == "toml"))
            .collect();
        files.sort();
        for file in files {
            let Ok(src) = std::fs::read_to_string(&file) else { continue };
            let Ok(frag) = Config::parse(&src) else {
                eprintln!("ignored invalid fragment {}", file.display());
                continue;
            };
            let name = file.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            for mut p in frag.profiles {
                if self.profile(&p.id).is_none() {
                    p.source = Some(format!("fragment:{name}"));
                    self.profiles.push(p);
                }
            }
            self.schemes.extend(frag.schemes);
            self.actions.extend(frag.actions);
        }
    }
}

impl Profile {
    fn normalize(&mut self) {
        if let Some(line) = self.commandline.take()
            && self.cmd.is_empty()
        {
            let mut parts = split_commandline(&line).into_iter();
            self.cmd = parts.next().unwrap_or_default();
            self.args = parts.collect();
        }
        if self.name.is_empty() {
            self.name = self.id.clone();
        }
    }

    /// Fill the gaps of a user profile overriding a generated one (same id).
    fn inherit(&mut self, generated: &Profile) {
        if self.cmd.is_empty() || self.cmd == "$SHELL" {
            self.cmd.clone_from(&generated.cmd);
            self.args.clone_from(&generated.args);
        }
        if self.name.is_empty() || self.name == self.id {
            self.name.clone_from(&generated.name);
        }
        if self.cwd.is_none() {
            self.cwd.clone_from(&generated.cwd);
        }
        if self.login_shell.is_none() {
            self.login_shell = generated.login_shell;
        }
        for (k, v) in &generated.extra {
            if !self.extra.contains_key(k) {
                self.extra.insert(k.clone(), v.clone());
            }
        }
        self.source.clone_from(&generated.source);
    }
}

/// Split a command line into arguments. Quotes group; a backslash only escapes a quote
/// (so Windows paths survive).
pub fn split_commandline(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (_, '\\') if matches!(chars.peek(), Some('"')) && quote != Some('\'') => {
                cur.push('"');
                chars.next();
                started = true;
            }
            (Some(q), c) if c == q => quote = None,
            (None, '"' | '\'') => {
                quote = Some(c);
                started = true;
            }
            (None, c) if c.is_whitespace() => {
                if started {
                    out.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            (_, c) => {
                cur.push(c);
                started = true;
            }
        }
    }
    if started {
        out.push(cur);
    }
    out
}

fn shell_profile() -> Profile {
    Profile {
        id: "shell".into(),
        name: "Shell".into(),
        cmd: "$SHELL".into(),
        ..Default::default()
    }
}

/// Directory holding `config.toml`. Portable mode: a `.portable` file next to the executable
/// moves it to `<exe dir>/settings`.
pub fn config_dir() -> PathBuf {
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| Some(p.parent()?.to_path_buf()))
        && dir.join(".portable").exists()
    {
        return dir.join("settings");
    }
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("terminux")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.toml")
}

/// Per-machine state (session layout).
pub fn state_dir() -> PathBuf {
    if config_dir().ends_with("settings") {
        return config_dir();
    }
    dirs::state_dir()
        .or_else(dirs::data_local_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("terminux")
}

/// Resolve a user-supplied path: `~` expansion, relative paths against the config directory.
pub fn resolve_path(p: &str) -> PathBuf {
    let path = match (p.strip_prefix('~'), dirs::home_dir()) {
        (Some(rest), Some(home)) => home.join(rest.trim_start_matches(['/', '\\'])),
        _ => PathBuf::from(p),
    };
    if path.is_relative() { config_dir().join(path) } else { path }
}

/// Write the default config file if none exists; returns its path.
pub fn ensure_file() -> PathBuf {
    let path = config_path();
    if !path.exists() {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&path, initial_config(dynamic_profiles::all()));
    }
    path
}

/// Default config with the profiles generated on this machine written out, so the
/// first config file lists every available profile.
fn initial_config(generated: &[Profile]) -> String {
    const MARKER: &str = "# Color schemes.";
    let mut block = String::new();
    for p in generated {
        let s = |v: &str| Value::String(v.into()).to_string();
        block.push_str(&format!("[[profile]]   # generated: {}\n", p.source.as_deref().unwrap_or("")));
        block.push_str(&format!("id = {}\nname = {}\ncmd = {}\n", s(&p.id), s(&p.name), s(&p.cmd)));
        if !p.args.is_empty() {
            let args = Value::Array(p.args.iter().cloned().map(Value::String).collect());
            block.push_str(&format!("args = {args}\n"));
        }
        for (k, v) in &p.extra {
            block.push_str(&format!("{k} = {v}\n"));
        }
        block.push('\n');
    }
    match DEFAULT_CONFIG.find(MARKER) {
        Some(i) if !block.is_empty() => {
            format!("{}{block}{}", &DEFAULT_CONFIG[..i], &DEFAULT_CONFIG[i..])
        }
        _ => DEFAULT_CONFIG.to_string(),
    }
}

/// Parse error located in UTF-16 code units (CodeMirror offsets).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ConfigError {
    pub message: String,
    pub from: usize,
    pub to: usize,
}

fn utf16_offset(src: &str, byte: usize) -> usize {
    let mut i = byte.min(src.len());
    while !src.is_char_boundary(i) {
        i -= 1;
    }
    src[..i].encode_utf16().count()
}

pub fn validate(src: &str) -> Option<ConfigError> {
    let e = Config::parse(src).err()?;
    let (from, to) = e
        .span()
        .map(|r| (utf16_offset(src, r.start), utf16_offset(src, r.end)))
        .unwrap_or((0, 0));
    Some(ConfigError { message: e.message().to_string(), from, to })
}

/// Validate then write the user config.
pub fn write(src: &str) -> Result<(), String> {
    if let Some(e) = validate(src) {
        return Err(e.message);
    }
    std::fs::write(ensure_file(), src).map_err(|e| e.to_string())
}

/// Load the user config, writing the default file on first run.
pub fn load() -> Config {
    let path = ensure_file();
    let cfg = match std::fs::read_to_string(&path) {
        Ok(src) => Config::parse(&src).unwrap_or_else(|e| {
            let mut cfg = Config::defaults();
            cfg.error = Some(format!("{}: {e}", path.display()));
            cfg
        }),
        Err(_) => Config::defaults(),
    };
    cfg.extend(path.parent())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_parses() {
        let cfg = Config::defaults();
        assert_eq!(cfg.default_profile, "shell");
        assert!(cfg.profile("shell").is_some());
        #[cfg(not(windows))]
        assert!(cfg.profile("wsl").is_none());
    }

    #[test]
    fn shell_profile_always_present() {
        let cfg = Config::parse("font_size = 12").unwrap();
        assert_eq!(cfg.font_size, 12.0);
        assert!(cfg.profile("shell").is_some());
    }

    #[test]
    fn invalid_config_errors() {
        assert!(Config::parse("font_size = \"big\"").is_err());
    }

    #[test]
    fn validate_ok() {
        assert_eq!(validate(DEFAULT_CONFIG), None);
    }

    #[test]
    fn validate_span_is_utf16() {
        // "é" is 2 bytes in UTF-8 but 1 UTF-16 unit.
        let src = "# é\nfont_size = \"big\"\n";
        let e = validate(src).unwrap();
        let start = src.find('"').unwrap() - 1; // byte offset of the value
        assert!(e.from <= start && e.to > e.from);
        let units: Vec<u16> = src.encode_utf16().collect();
        let slice = String::from_utf16(&units[e.from..e.to]).unwrap();
        assert!(slice.contains("big"), "span {slice:?}");
    }

    #[test]
    fn legacy_config_still_parses() {
        let src = r##"
default_profile = "shell"
font_size = 14
scrollback = 100000
notifications = true
[[profile]]
id = "shell"
name = "Shell"
cmd = "$SHELL"
[keys]
new_tab = "Ctrl+Shift+T"
[theme]
background = "#000000"
"##;
        let cfg = Config::parse(src).unwrap();
        assert_eq!(cfg.scrollback, 100_000);
        assert_eq!(cfg.keys["new_tab"], OneOrMany::One("Ctrl+Shift+T".into()));
        assert_eq!(cfg.theme["background"], "#000000");
    }

    #[test]
    fn passthrough_and_sections() {
        let src = r##"
app_theme = "light"
launch_mode = "maximized"
initial_cols = 100
[defaults]
opacity = 80
cwd = "~/work"
env = { A = "1", B = "2" }
[defaults.font]
size = 12
[[profile]]
id = "a"
commandline = "ssh -p 22 'my host'"
color_scheme = { light = "One Half Light", dark = "Campbell" }
env = { B = "3" }
[profile.unfocused_appearance]
opacity = 50
[[scheme]]
name = "Mine"
background = "#101010"
[[ui_theme]]
name = "t"
[ui_theme.tab]
background = "accent"
[[action]]
name = "Hello"
command = "send_input"
input = "hi\r"
keys = ["Ctrl+Shift+H", "F5"]
[keys]
copy = ["Ctrl+C", "Ctrl+Insert"]
paste = ""
"##;
        let cfg = Config::parse(src).unwrap();
        assert_eq!(cfg.get_str("app_theme"), Some("light"));
        assert_eq!(cfg.get_int("initial_cols"), Some(100));
        assert!(cfg.wants_transparency());
        let p = cfg.profile("a").unwrap();
        assert_eq!(p.name, "a");
        assert_eq!(p.cmd, "ssh");
        assert_eq!(p.args, ["-p", "22", "my host"]);
        assert_eq!(p.cwd.as_deref(), Some("~/work"));
        assert_eq!(p.env["A"], "1");
        assert_eq!(p.env["B"], "3");
        assert!(p.extra["color_scheme"].is_table());
        assert_eq!(cfg.schemes[0]["name"].as_str(), Some("Mine"));
        assert_eq!(cfg.ui_themes[0]["tab"]["background"].as_str(), Some("accent"));
        assert_eq!(cfg.actions[0]["command"].as_str(), Some("send_input"));
        assert_eq!(cfg.keys["paste"], OneOrMany::One(String::new()));
        // Serialized for the frontend: flat, no duplicate keys.
        let json = serde_json::to_value(&cfg).unwrap();
        assert_eq!(json["launch_mode"], "maximized");
        assert_eq!(json["profiles"][1]["unfocused_appearance"]["opacity"], 50);
        assert_eq!(json["defaults"]["font"]["size"], 12);
        assert!(json.get("profile").is_none());
    }

    #[test]
    fn commandline_splitting() {
        assert_eq!(split_commandline("wsl.exe -d Ubuntu"), ["wsl.exe", "-d", "Ubuntu"]);
        assert_eq!(split_commandline(r#""C:\Program Files\x.exe" /k "a b""#), [r"C:\Program Files\x.exe", "/k", "a b"]);
        assert_eq!(split_commandline(r#"sh -c 'echo "hi"' """#), ["sh", "-c", r#"echo "hi""#, ""]);
        assert_eq!(split_commandline(r#"echo \"x\""#), ["echo", r#""x""#]);
        assert!(split_commandline("   ").is_empty());
    }

    #[test]
    fn generated_profile_is_overridable() {
        let generated = Profile {
            id: "ssh-box".into(),
            name: "SSH - box".into(),
            cmd: "ssh".into(),
            args: vec!["box".into()],
            source: Some("ssh".into()),
            ..Default::default()
        };
        let mut cfg = Config::parse("[[profile]]\nid = \"ssh-box\"\nhidden = true\n").unwrap();
        cfg.profiles.iter_mut().find(|p| p.id == "ssh-box").unwrap().inherit(&generated);
        let p = cfg.profile("ssh-box").unwrap();
        assert!(p.hidden);
        assert_eq!((p.cmd.as_str(), p.name.as_str()), ("ssh", "SSH - box"));
        assert_eq!(p.source.as_deref(), Some("ssh"));
    }

    #[test]
    fn initial_config_lists_generated_profiles() {
        let mut wsl = Profile {
            id: "wsl-ubuntu".into(),
            name: "Ubuntu \"LTS\"".into(),
            cmd: "wsl.exe".into(),
            args: vec!["-d".into(), "Ubuntu".into()],
            source: Some("wsl".into()),
            ..Default::default()
        };
        wsl.extra.insert("path_translation_style".into(), Value::String("wsl".into()));
        let src = initial_config(&[wsl]);
        let cfg = Config::parse(&src).unwrap();
        let p = cfg.profile("wsl-ubuntu").unwrap();
        assert_eq!(p.name, "Ubuntu \"LTS\"");
        assert_eq!(p.args, ["-d", "Ubuntu"]);
        assert_eq!(p.extra["path_translation_style"].as_str(), Some("wsl"));
        assert_eq!(initial_config(&[]), DEFAULT_CONFIG);
    }

    #[test]
    fn profile_example_is_valid() {
        let example: String = DEFAULT_CONFIG
            .lines()
            .skip_while(|l| !l.starts_with("# Example using every profile option"))
            .skip(1)
            .take_while(|l| !l.is_empty())
            .map(|l| l.strip_prefix("# ").unwrap_or(l))
            .filter(|l| !l.starts_with('#'))
            .collect::<Vec<_>>()
            .join("\n");
        let cfg = Config::parse(&example).unwrap();
        let p = cfg.profile("example").unwrap();
        assert_eq!(p.cwd.as_deref(), Some("~/work"));
        assert_eq!(p.env["EDITOR"], "vim");
        assert!(p.extra["font"].is_table());
    }
}
