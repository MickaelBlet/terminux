#!/usr/bin/env bash
# Build Terminux in Docker. Artifacts land in dist/.
# Usage: scripts/docker-build.sh [linux|windows|all]   (default: all; "all" builds both in parallel)
# Env: FAST=1        thin LTO + parallel codegen (much faster, slightly bigger binary)
#      SKIP_TESTS=1  skip svelte-check, vitest and cargo test (linux)
# Linux: deb/rpm (glibc >= 2.35, host webkit2gtk-4.1) + self-contained AppImage (glibc >= 2.28).
set -euo pipefail
cd "$(dirname "$0")/.."

platforms=("${1:-all}")
[[ "${platforms[0]}" == all ]] && platforms=(linux windows)
mkdir -p dist

image() {
  echo "==> building toolchain image terminux-build:$1"
  docker build -f docker/Dockerfile --target "$1" -t "terminux-build:$1" docker/
}

build() {
  local p=$1
  echo "==> building Terminux for $p"
  [[ "$p" == linux ]] && rm -f dist/*.deb dist/*.rpm dist/*.AppImage
  docker run --rm \
    -v "$PWD:/src:ro" \
    -v "$PWD/dist:/out" \
    -v terminux-cargo-registry:/usr/local/cargo/registry \
    -v "terminux-target-$p:/work/src-tauri/target" \
    -v "terminux-node-modules-$p:/work/node_modules" \
    -v terminux-npm-cache:/root/.npm \
    -v terminux-xwin-cache:/root/.cache/cargo-xwin \
    -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
    -e SKIP_TESTS="${SKIP_TESTS:-}" "${fast_env[@]}" \
    "terminux-build:$p" "$p"
  if [[ "$p" == linux ]]; then
    echo "==> repacking AppImage"
    local deb
    deb=$(cd dist && ls Terminux_*_amd64.deb)
    docker run --rm -v "$PWD/dist:/out" \
      -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
      terminux-build:appimage "$deb"
  fi
}

fast_env=()
[[ -n "${FAST:-}" ]] && fast_env=(-e CARGO_PROFILE_RELEASE_LTO=thin -e CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16)

for p in "${platforms[@]}"; do
  case "$p" in linux|windows) ;; *) echo "unknown platform: $p" >&2; exit 2 ;; esac
done
# Images first (sequential: shared layer cache, readable output).
for p in "${platforms[@]}"; do
  image "$p"
  [[ "$p" == linux ]] && image appimage
done

if (( ${#platforms[@]} == 1 )); then
  build "${platforms[0]}"
else
  pids=()
  for p in "${platforms[@]}"; do
    build "$p" > >(sed -u "s/^/[$p] /") 2>&1 &
    pids+=($!)
  done
  rc=0
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  (( rc == 0 )) || { echo "build failed" >&2; exit 1; }
fi

echo
echo "Artifacts in dist/:"
ls -1 dist | sed 's/^/  /'
