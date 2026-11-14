#!/usr/bin/env bash
# Linux bundles (deb, rpm, AppImage) via Docker -> dist/
exec "$(dirname "$0")/docker-build.sh" linux
