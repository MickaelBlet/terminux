# Building and release

How to run Terminux in development, produce packaged builds (Docker, `cargo-xwin` cross compilation, AppImage repack), what lands in `dist/`, what CI does on `v*` tags, and the procedure and version locations for a release.

## Contents

- [Prerequisites](#prerequisites)
- [Development run](#development-run)
- [Frontend build](#frontend-build)
- [Docker builds](#docker-builds)
- [Windows cross compile (cargo-xwin)](#windows-cross-compile-cargo-xwin)
- [AppImage repack (quick-sharun)](#appimage-repack-quick-sharun)
- [Artifacts in dist/](#artifacts-in-dist)
- [Native builds without Docker](#native-builds-without-docker)
- [Continuous integration](#continuous-integration)
- [Release procedure](#release-procedure)
- [Version bump locations](#version-bump-locations)
- [Documentation screenshots](#documentation-screenshots)
- [See also](#see-also)

## Prerequisites

- Node.js 22 (the Docker images and CI use 22) and npm.
- A Rust toolchain (the crate uses `edition = "2024"` and let-chains, so Rust 1.88 or newer).
- Linux: the WebKitGTK 4.1 development stack used by Tauri, as installed in `docker/Dockerfile` and CI: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev` (CI uses `libappindicator3-dev`), `librsvg2-dev`, `libssl-dev`, `libxdo-dev`, `pkg-config`, `build-essential`, plus `patchelf` for AppImage in CI.
- Windows: WebView2 (preinstalled on current Windows) and the MSVC toolchain.
- Docker, for the packaged builds in `scripts/`.

## Development run

```sh
npm install
npm run tauri dev
```

`npm run tauri dev` runs the Tauri CLI, which executes `beforeDevCommand` (`npm run dev`, that is `vite dev`) and loads `devUrl` `http://localhost:1420`. Vite is configured in `vite.config.js` with a fixed port:

- `server.port = 1420` and `strictPort = true`: if the port is taken, Vite fails instead of picking another one (the Tauri `devUrl` is fixed).
- `server.host` is `127.0.0.1`, or the value of the `TAURI_DEV_HOST` environment variable (for developing against a remote device); when set, HMR uses `ws` on port 1421.
- `src-tauri/**` is excluded from Vite's file watcher; Cargo rebuilds the Rust side on change.
- `clearScreen = false` keeps Rust compiler errors visible.

Useful while developing:

- Frontend `console.info/warn/error` and unhandled errors are mirrored to the backend stderr as `[frontend:<level>] ...` (visible in the `tauri dev` terminal).
- Config hot reload: edit `~/.config/terminux/config.toml` (Windows: `%APPDATA%\terminux\config.toml`) and the running app updates. A `.portable` file next to the executable moves the config to `<exe dir>/settings`.
- The dev CSP (`app.security.devCsp`) allows inline scripts and the Vite websocket; the release CSP does not.
- On Linux, `main.rs` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless you set it; the default renderer is `canvas` on Linux (override with `renderer = "webgl"` in the config).

Checks to run before committing:

```sh
npm run check
npx vitest run
cargo test --manifest-path src-tauri/Cargo.toml
```

## Frontend build

`npm run build` runs `vite build` with `adapter-static` (`fallback: "index.html"`) and writes the SPA to `build/`, which `tauri.conf.json` references as `frontendDist` (`../build`, relative to `src-tauri`). `beforeBuildCommand` runs it automatically for `npx tauri build`.

## Docker builds

```sh
scripts/build-linux.sh        # deb, rpm, AppImage
scripts/build-windows.sh      # NSIS installer + portable exe
scripts/docker-build.sh       # both, in parallel (default: all)
scripts/docker-build.sh linux # or: windows
```

`build-linux.sh` and `build-windows.sh` are one-line wrappers around `scripts/docker-build.sh <platform>`. Artifacts are written to `dist/` (created if missing, git-ignored).

Environment variables:

| Variable | Effect |
| --- | --- |
| `FAST=1` | Thin LTO and 16 codegen units (`CARGO_PROFILE_RELEASE_LTO=thin`, `CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16`): much faster, slightly bigger binary. The release profile in `Cargo.toml` is otherwise `lto = true`, `codegen-units = 1`, `opt-level = 3`, `panic = "abort"`, `strip = true`. |
| `SKIP_TESTS=1` | Skip `npm run check`, `npx vitest run` and `cargo test --locked` in the Linux build. |

What `docker-build.sh` does:

1. Builds the toolchain images from `docker/Dockerfile` (sequentially, for the layer cache): target `linux` -> `terminux-build:linux`, `appimage` -> `terminux-build:appimage`, `windows` -> `terminux-build:windows`.
2. Runs the build container with the source mounted read-only at `/src` and `dist/` at `/out`, with named volumes for caches: `terminux-cargo-registry`, `terminux-target-<platform>` (Cargo target dir), `terminux-node-modules-<platform>`, `terminux-npm-cache`, `terminux-xwin-cache`. `HOST_UID`/`HOST_GID` are passed so artifacts are chowned to you.
3. For Linux, removes old `dist/*.deb`, `*.rpm`, `*.AppImage` first, then repacks the AppImage (below).
4. With `all`, the two platforms build in parallel with prefixed output (`[linux]`, `[windows]`); a failure on either exits non-zero.

Inside the container, `docker/build.sh <linux|windows>` copies the sources to `/work` (excluding `node_modules`, `build`, `.svelte-kit`, `dist`, `.git`, `src-tauri/target`), reinstalls `node_modules` with `npm ci` only when the `package-lock.json` checksum changed, then:

- **linux**: unless `SKIP_TESTS`, runs `npm run check`, `npx vitest run`, `cargo test --locked --manifest-path src-tauri/Cargo.toml`; then `npx tauri build --bundles deb,rpm -- --locked` and copies the `.deb` and `.rpm` to `/out`.
- **windows**: see below.

The images are pinned by digest/checksum (Ubuntu 22.04, Node 22 slim, Arch Linux, rustup, quick-sharun); bump them deliberately. Linux debs/rpms are built on Ubuntu 22.04 (glibc 2.35, the oldest base with `webkit2gtk-4.1`) and use the host's `webkit2gtk-4.1`.

## Windows cross compile (cargo-xwin)

The Windows build runs on Linux in the `windows` image (`rust:1.93-trixie` plus `clang`, `lld`, `llvm`, `nsis`, `cargo-xwin`, the `x86_64-pc-windows-msvc` target). `XWIN_ACCEPT_LICENSE=1` accepts the Windows SDK license that `cargo-xwin` downloads (cached in the `terminux-xwin-cache` volume). `libayatana-appindicator3-dev` is installed because tauri-cli looks for an appindicator library through `pkg-config` whenever the `tray-icon` feature is on, even when bundling for Windows.

The container runs:

```sh
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe /out/
cp src-tauri/target/x86_64-pc-windows-msvc/release/terminux.exe /out/terminux-portable.exe
```

Tests are not run for the Windows target (they are run by the Linux build and by CI on Windows).

To build by hand outside Docker you need `cargo install --locked cargo-xwin`, `rustup target add x86_64-pc-windows-msvc`, `clang`/`lld`/`llvm` and `nsis`.

## AppImage repack (quick-sharun)

After the Linux container finishes, `docker-build.sh` runs the `appimage` image (`docker/appimage.sh`) on the produced `.deb`:

1. The version is parsed from the deb file name (`Terminux_<version>_amd64.deb`).
2. The deb's `data.tar.*` is extracted into the image root with `bsdtar`.
3. `quick-sharun` (from the Anylinux-AppImages project, pinned by commit and SHA-256 in the Dockerfile) bundles `/usr/bin/terminux` plus Arch Linux's `webkit2gtk-4.1` (debloated "mini" packages), GTK, Mesa and glibc itself. Every bundled executable, including the WebKit helper processes, runs through the bundled `ld.so`. It collects dlopened libraries by running the app under Xvfb for a few seconds (`STRACE_MODE`, the default); `libayatana-appindicator3.so*` is passed explicitly because the tray library is dlopened and would not be seen when no tray is shown.
4. Environment given to quick-sharun: `VERSION`, `OUTPUT_APPIMAGE=1`, `OUTPATH`, `DESKTOP=/usr/share/applications/Terminux.desktop`, `ICON=/usr/share/icons/hicolor/256x256@2/apps/terminux.png`, `OUTNAME=Terminux_<version>_amd64.AppImage`.
5. The resulting AppImage is copied to `dist/` and chowned.

The self-contained AppImage runs on distributions with glibc 2.28 or newer (for example RHEL/Rocky 8), unlike the deb/rpm which need glibc 2.35 and the host `webkit2gtk-4.1`. At runtime `main.rs` removes `GTK_MODULES` when `APPIMAGE` is set, because host GTK modules cannot load inside the bundle. The debloated Arch packages only exist for current (rolling) Arch, which is why this image is based on `archlinux:latest` (pinned by digest).

## Artifacts in dist/

| File | Source |
| --- | --- |
| `Terminux_<version>_amd64.deb` | Linux build (`tauri build --bundles deb`) |
| `*.rpm` | Linux build (`--bundles rpm`; file name chosen by Tauri) |
| `Terminux_<version>_amd64.AppImage` | AppImage repack from the deb |
| NSIS installer `.exe` (Tauri's `Terminux_<version>_x64-setup.exe` naming) | Windows build (`--bundles nsis`) |
| `terminux-portable.exe` | Windows build: the raw release binary |

<!-- TODO verify: exact rpm and NSIS installer file names produced by tauri-bundler. -->

Portable mode on Windows: place an (empty) file named `.portable` next to the exe; the config then lives in `<exe dir>/settings` (see `config_dir()` in `src-tauri/src/config.rs`). The build does not create that file for you.

## Native builds without Docker

```sh
npx tauri build                    # all bundle targets of the current platform (bundle.targets = "all")
npx tauri build --bundles deb,rpm  # or pick bundles
cargo build --manifest-path src-tauri/Cargo.toml --release   # just the binary (run `npm run build` first)
```

Output lands in `src-tauri/target/release/` (binary `terminux`) and `src-tauri/target/release/bundle/`.

## Continuous integration

`.github/workflows/build.yml`:

- **Triggers**: pushing a tag matching `v*`, or manual `workflow_dispatch`.
- **Matrix**: `ubuntu-22.04` and `windows-latest` (`fail-fast: false`).
- **Steps**: checkout, Node 22, stable Rust (`dtolnay/rust-toolchain@stable`); on Linux `apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`; `npm ci`; `npx vitest run`; `cargo test --manifest-path src-tauri/Cargo.toml`; then `tauri-apps/tauri-action@v0` with `tagName: ${{ github.ref_name }}`, `releaseName: Terminux ${{ github.ref_name }}` and `releaseDraft: true`, using `GITHUB_TOKEN`.
- The result is a **draft** GitHub release with the platform bundles attached by `tauri-action`. Review and publish it manually.

Differences from the Docker flow: CI does not run `npm run check`, does not build the repacked self-contained AppImage or `terminux-portable.exe`, and builds Windows natively rather than with `cargo-xwin`. The Docker scripts are the reference for the artifacts documented above.

## Release procedure

1. Make sure the release branch is green locally:

   ```sh
   npm run check && npx vitest run && cargo test --manifest-path src-tauri/Cargo.toml
   ```

2. Bump the version in [every location](#version-bump-locations) to the same value.
3. Optionally build and smoke-test the packages locally: `scripts/docker-build.sh` (use `FAST=1` for a quick pass), install the deb/AppImage and the Windows installer.
4. Commit the version bump, then create an annotated tag `vX.Y.Z` and push both:

   ```sh
   git tag -a vX.Y.Z -m "Terminux X.Y.Z"
   git push origin <branch> vX.Y.Z
   ```

5. Wait for the `build` workflow; open the draft release on GitHub, check the attached artifacts, edit the notes, publish.
6. If you also want the self-contained AppImage and the portable exe on the release, build them with `scripts/docker-build.sh` and upload `dist/*` to the release manually (CI does not produce them).

## Version bump locations

The version is duplicated; keep all of these identical (currently `0.1.0`):

| File | Field |
| --- | --- |
| `package.json` | `"version"` |
| `package-lock.json` | top-level `"version"` and `packages[""].version` (`npm install --package-lock-only` or `npm version` updates both) |
| `src-tauri/Cargo.toml` | `[package] version` (also used at runtime: `TERM_PROGRAM_VERSION` is `CARGO_PKG_VERSION`) |
| `src-tauri/Cargo.lock` | the `terminux` package entry (updated by running `cargo build`/`cargo update -p terminux`; the Docker build uses `--locked`, so a stale lock fails) |
| `src-tauri/tauri.conf.json` | `"version"` (names the bundles and the installer) |

The git tag is `v` + that version.

## Documentation screenshots

The images in `docs/images/` are generated from the real frontend, without Tauri: `scripts/screenshots/mock.js` mocks the IPC (`window.__TAURI_INTERNALS__`) and fake PTYs replay canned ANSI output (prompts with OSC 133 marks, `git`, `htop`-like screens, test runs). `scripts/screenshots/shoot.mjs` drives the `App` store through `app.run(...)` with Playwright and writes one PNG per scene (1280×800).

```sh
npx vite dev --port 1420 &
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/screenshots/shoot.mjs           # all scenes
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/screenshots/shoot.mjs find tabs # some scenes
```

- `playwright-core` is not a project dependency: point `PLAYWRIGHT_CORE` at any install with a downloaded Chromium (`npx playwright install chromium`).
- Scenes live in the `SCENES` object of `shoot.mjs`; canned outputs in `OUTPUT` of `mock.js` (select one for the next spawned pane with `queue(p, ["history"])`). The config shown in the editor is `scripts/screenshots/config.toml`.
- Re-run after UI changes and review the images before committing.

## See also

- [testing.md](testing.md): what the pre-release checks cover
- [architecture.md](architecture.md): process and security model
- [contributing.md](contributing.md): conventions and PR checklist
- [../user-guide/01-installation.md](../user-guide/01-installation.md): how users install the artifacts
- [../reference/file-locations.md](../reference/file-locations.md): config path and portable layout
