#!/usr/bin/env bash
# In-container AppImage repack. Usage: terminux-appimage <deb file name in /out>
set -euo pipefail
deb=/out/${1:?usage: terminux-appimage <deb>}
version=$(basename "$deb" | sed -E 's/^Terminux_(.+)_amd64\.deb$/\1/')

bsdtar -xOf "$deb" 'data.tar.*' | bsdtar -xf - -C /
mkdir -p /appimage /tmp/appimage-out
cd /appimage
# STRACE_MODE (default) runs the app under Xvfb for a few seconds to collect dlopened libraries.
export VERSION=$version OUTPUT_APPIMAGE=1 OUTPATH=/tmp/appimage-out \
  DESKTOP=/usr/share/applications/Terminux.desktop \
  ICON=/usr/share/icons/hicolor/256x256@2/apps/terminux.png \
  OUTNAME=Terminux_${version}_amd64.AppImage
# The tray library is dlopened (not seen by strace when no tray is shown): add it explicitly.
quick-sharun /usr/bin/terminux /usr/lib/libayatana-appindicator3.so*
cp -v /tmp/appimage-out/*.AppImage /out/
chown "${HOST_UID:-0}:${HOST_GID:-0}" /out/*.AppImage
