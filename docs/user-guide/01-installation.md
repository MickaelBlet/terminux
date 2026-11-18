# Installation

Terminux ships as native packages for Linux (`deb`, `rpm`, AppImage) and Windows (NSIS installer and a portable executable). This page covers what to install, what the system must provide, portable mode and where Terminux keeps its files.

## Contents

- [Packages](#packages)
- [Runtime requirements](#runtime-requirements)
- [Installing on Linux](#installing-on-linux)
- [Installing on Windows](#installing-on-windows)
- [Portable mode](#portable-mode)
- [First launch](#first-launch)
- [Where files live](#where-files-live)
- [Building from source](#building-from-source)
- [Uninstalling](#uninstalling)

## Packages

The release scripts (`scripts/build-linux.sh`, `scripts/build-windows.sh`, `scripts/docker-build.sh`) put every artifact in `dist/`.

| Platform | Artifact | Notes |
| --- | --- | --- |
| Linux | `Terminux_<version>_amd64.deb` | Built on Ubuntu 22.04 (glibc >= 2.35). Uses the system `webkit2gtk-4.1`. |
| Linux | `.rpm` | Built in the same image as the `deb`, same runtime requirements. |
| Linux | `.AppImage` | Repacked from the `deb`. Bundles WebKitGTK, GTK, Mesa and glibc, so it needs nothing from the host (runs on RHEL/Rocky 8, glibc 2.28). |
| Windows | NSIS installer (`.exe`) | Cross-compiled with `cargo-xwin`. |
| Windows | `terminux-portable.exe` | The bare executable; see [Portable mode](#portable-mode). |

The packaging identifier is `com.terminux.app`, the product name is `Terminux`, and the current version is `0.1.6` (`src-tauri/tauri.conf.json`).

Tagged releases (`v*`) are built by the GitHub Actions workflow (`.github/workflows/build.yml`) on Ubuntu 22.04 and Windows with `tauri-action`, which publishes a draft release. CI also uploads `terminux-portable.exe` and the self-contained AppImage (repacked from the deb) to the release. The bundle `targets` in `tauri.conf.json` is `"all"`, so the CI job produces every format Tauri supports on the runner. <!-- TODO verify: exact set of CI artifacts (for example whether an .msi is attached on Windows) -->

## Runtime requirements

### Linux

| Package | Requirement |
| --- | --- |
| `deb` / `rpm` | `webkit2gtk-4.1` (WebKitGTK 4.1 and GTK 3) installed from your distribution, and glibc >= 2.35. |
| AppImage | None beyond FUSE support for AppImages. WebKitGTK, GTK, Mesa and glibc are inside the image. <!-- TODO verify: FUSE requirement is general AppImage behavior, not checked in this repo --> |

Why glibc 2.35: the `deb`/`rpm` are built on Ubuntu 22.04, the oldest base that ships `webkit2gtk-4.1`. If your distribution is older (RHEL/Rocky 8, glibc 2.28), use the AppImage.

Rendering note: on Linux the terminal defaults to the `canvas` renderer because WebGL under WebKitGTK is unreliable (blank terminals on WSLg and some drivers). Pick another with [`renderer`](../reference/configuration.md#renderer).

### Windows

The Windows build uses the WebView2 runtime that Tauri apps rely on. <!-- TODO verify: WebView2 handling in the NSIS installer (bootstrapper/embedded) is the Tauri default and is not configured in this repo -->

Windows-only features: acrylic and Mica backdrops, WSL and Windows PowerShell/cmd generated profiles, path translation for dropped files (`wsl`, `cygwin`, `msys2`, `mingw`).

## Installing on Linux

```sh
# Debian / Ubuntu
sudo apt install ./Terminux_0.1.6_amd64.deb

# Fedora / RHEL family (file name pattern may differ)
sudo dnf install ./Terminux-*.rpm

# AppImage: no install
chmod +x Terminux*.AppImage
./Terminux*.AppImage
```

Terminux is a single-instance application: starting it again hands the command line to the running instance (see [Windows](05-windows.md#launching-again-and-windowing_behavior)).

## Installing on Windows

Run the NSIS installer, or copy `terminux-portable.exe` anywhere and run it. For a fully self-contained setup, add the `.portable` marker described below.

## Portable mode

Portable mode keeps configuration and state next to the executable instead of in your profile directory.

1. Put the executable in a folder you own (USB stick, `D:\Tools\Terminux`, ...).
2. Create an empty file named `.portable` in the same folder as the executable.
3. Start Terminux.

```sh
# Linux / macOS style shell
touch /path/to/terminux-dir/.portable
```

```powershell
# PowerShell
New-Item -ItemType File "D:\Tools\Terminux\.portable"
```

With `.portable` present:

| What | Location |
| --- | --- |
| `config.toml` | `<exe dir>/settings/config.toml` |
| Fragments | `<exe dir>/settings/fragments/*.toml` |
| Session (`session.json`) | `<exe dir>/settings/session.json` |
| Relative paths in config (`background_image`, `bell_sound`, icons) | resolved against `<exe dir>/settings` |

The marker is checked at every start by looking for `.portable` next to the running executable. Remove the file to go back to the per-user location.

## First launch

On first start Terminux writes a commented default `config.toml` (see [Where files live](#where-files-live)). The file also lists the profiles generated on your machine (WSL distributions, SSH hosts from `~/.ssh/config`, PowerShell) just above the color-scheme section, so you can see and edit them. The config is watched and hot-reloaded: save the file and open windows update immediately.

- Open the settings UI with `Ctrl+,` (`open_settings`): forms for every setting, auto-saved to `config.toml`. Its **TOML** switch (or `open_settings_toml`) gives the built-in text editor with completion (`Ctrl+Space`), which underlines unknown keys.
- Open the read-only defaults with `Ctrl+Alt+,` (`open_default_settings`).
- Open the file in your external editor with `Ctrl+Shift+,` (`open_settings_file`).
- The default profile is `shell`, which runs `$SHELL` (the user's default shell).

If `config.toml` has a syntax error, Terminux shows a banner ("Config error, using defaults") and runs with the built-in defaults until you fix it.

Next: [Getting started](02-getting-started.md).

## Where files live

| What | Linux | Windows | Portable |
| --- | --- | --- | --- |
| `config.toml` | `~/.config/terminux/config.toml` | `%APPDATA%\terminux\config.toml` | `<exe dir>/settings/config.toml` |
| `fragments/*.toml` | `~/.config/terminux/fragments/` | `%APPDATA%\terminux\fragments\` | `<exe dir>/settings/fragments/` |
| Session store | `~/.local/state/terminux/session.json` (the XDG state dir; falls back to the local data dir) | `%LOCALAPPDATA%\terminux\session.json` | `<exe dir>/settings/session.json` |

The session store is only written while [`first_window_preference`](../reference/configuration.md#first_window_preference) is `persisted_window_layout` (the default). See [file locations](../reference/file-locations.md) for the full list.

Some UI choices are remembered per machine in the webview's local storage rather than in `config.toml`: the tab position chosen from the menu, the vertical tab width and its collapsed state.

## Building from source

Development builds and Docker-based packaging are described in [building and release](../developer/building-and-release.md). In short:

```sh
npm install
npm run tauri dev
scripts/docker-build.sh        # both platforms, artifacts in dist/
```

## Uninstalling

- `deb`: `sudo apt remove terminux`. <!-- TODO verify: package name -->
- NSIS: use Windows "Apps & features".
- AppImage / portable: delete the file.
- To remove settings, delete the config directory from the table above. Terminux can also start at login (`start_on_user_login`); turn it off before uninstalling so the autostart entry is removed.

## See also

- [Getting started](02-getting-started.md)
- [Profiles](06-profiles.md) for portable-friendly profile paths and fragments
- [Configuration reference](../reference/configuration.md)
- [File locations](../reference/file-locations.md)
- [Building and release](../developer/building-and-release.md)
