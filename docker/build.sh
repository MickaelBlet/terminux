#!/usr/bin/env bash
# In-container build. Usage: terminux-build linux|windows
set -euo pipefail
platform=${1:?usage: terminux-build linux|windows}

# Copy sources (mounted read-only at /src) without host build dirs.
mkdir -p /work
tar -C /src \
  --exclude=./node_modules --exclude=./build --exclude=./.svelte-kit --exclude=./dist \
  --exclude=./.git --exclude=./src-tauri/target \
  -cf - . | tar -C /work -xf -
cd /work
# node_modules is a cached volume: reinstall only when the lockfile changes.
lock_sum=$(sha256sum package-lock.json | cut -d' ' -f1)
if [[ "$(cat node_modules/.lock-sum 2>/dev/null)" != "$lock_sum" ]]; then
  find node_modules -mindepth 1 -delete 2>/dev/null || true
  npm ci --no-audit --no-fund
  echo "$lock_sum" > node_modules/.lock-sum
fi

case "$platform" in
  linux)
    if [[ -z "${SKIP_TESTS:-}" ]]; then
      npm run check
      npx vitest run
      cargo test --locked --manifest-path src-tauri/Cargo.toml
    fi
    # AppImage: repacked self-contained from the deb by the `appimage` image (scripts/docker-build.sh).
    rm -rf src-tauri/target/release/bundle
    npx tauri build --bundles deb,rpm -- --locked
    cp -v src-tauri/target/release/bundle/deb/*.deb src-tauri/target/release/bundle/rpm/*.rpm /out/
    ;;
  windows)
    target=x86_64-pc-windows-msvc
    npx tauri build --runner cargo-xwin --target "$target" --bundles nsis
    cp -v src-tauri/target/$target/release/bundle/nsis/*.exe /out/
    cp -v src-tauri/target/$target/release/terminux.exe /out/terminux-portable.exe
    ;;
  *) echo "unknown platform: $platform" >&2; exit 2 ;;
esac

chown -R "${HOST_UID:-0}:${HOST_GID:-0}" /out
