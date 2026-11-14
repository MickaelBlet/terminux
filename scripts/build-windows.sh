#!/usr/bin/env bash
# Windows NSIS installer + portable exe via Docker (cargo-xwin) -> dist/
exec "$(dirname "$0")/docker-build.sh" windows
