# Build toolchains for Terminux. Source is mounted at runtime (see scripts/docker-build.sh).
# Linux constraints (same as WebOverlay): deb/rpm built on Ubuntu 22.04 (glibc 2.35, oldest base with
# webkit2gtk-4.1), self-contained AppImage (glibc bundled, runs on RHEL/Rocky 8, glibc 2.28).
# Base images and downloaded tools are pinned by digest or checksum: bump them on purpose.
FROM node:22-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6 AS node

FROM ubuntu:22.04@sha256:5ec03bb3441e8b0bf3b4f9cd4629a1ae763010dc3035bb8da3ae6cf026486401 AS linux
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl file pkg-config xdg-utils rpm \
      libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
ARG RUSTUP_VERSION=1.29.1
ARG RUSTUP_SHA256=dda7234360b7f578ca8b0ddcb80145646fa61a67c1720a5abc7051b35c9fcb71
ARG RUST_VERSION=1.99.1
RUN curl -fsSLo /tmp/rustup-init \
      https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init \
    && echo "${RUSTUP_SHA256}  /tmp/rustup-init" | sha256sum -c - \
    && chmod +x /tmp/rustup-init \
    && /tmp/rustup-init -y --profile minimal --default-toolchain ${RUST_VERSION} \
    && rm /tmp/rustup-init
# Official Node.js binaries (glibc >= 2.28).
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
ENV CI=true
COPY build.sh /usr/local/bin/terminux-build
ENTRYPOINT ["terminux-build"]

# Self-contained AppImage from the deb: the binary plus Arch Linux's webkit2gtk-4.1, GTK, Mesa and
# glibc itself, deployed by quick-sharun (every bundled executable, WebKit helpers included, runs
# through the bundled ld.so). The debloated packages only exist for current Arch (rolling).
FROM archlinux:latest@sha256:e82623936fa1a69700b48e98b058df6eaab18b737c27473a7234a40fdecb9413 AS appimage
ARG ANYLINUX_COMMIT=bec22efd769b122f1fa9c89606a2d969498a5930
ARG QUICK_SHARUN_SHA256=fa9dbe2532d568e1c1b8eeaba94d1c57109b776b5541d21b74d3f44b74faf4d3
ARG DEBLOATED_PKGS_SHA256=c8880a7e2f0a47b68ed5ae34e1b7aeecc2e5b3a55f3583b0b43d9818a15dbe8b
RUN pacman -Syu --noconfirm --needed \
      webkit2gtk-4.1 gtk3 libayatana-appindicator binutils file patchelf wget libarchive xorg-server-xvfb xorg-xauth \
    && cd /usr/local/bin \
    && u=https://raw.githubusercontent.com/pkgforge-dev/Anylinux-AppImages/${ANYLINUX_COMMIT}/useful-tools \
    && curl -fsSLo quick-sharun $u/quick-sharun.sh \
    && curl -fsSLo get-debloated-pkgs $u/get-debloated-pkgs.sh \
    && printf '%s  %s\n' ${QUICK_SHARUN_SHA256} quick-sharun ${DEBLOATED_PKGS_SHA256} get-debloated-pkgs \
      | sha256sum -c - \
    && chmod +x quick-sharun get-debloated-pkgs \
    && get-debloated-pkgs --add-common --prefer-nano webkit2gtk-4.1-mini \
    && pacman -Scc --noconfirm
COPY appimage.sh /usr/local/bin/terminux-appimage
ENTRYPOINT ["terminux-appimage"]

# Windows cross build (cargo-xwin). tauri-cli looks for an appindicator library on the host
# (via pkg-config) whenever the `tray-icon` feature is on, even when bundling for Windows.
FROM rust:1.93-trixie AS windows
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && apt-get update && apt-get install -y --no-install-recommends clang lld llvm nsis \
      pkg-config libayatana-appindicator3-dev \
 && rm -rf /var/lib/apt/lists/* \
 && rustup target add x86_64-pc-windows-msvc \
 && cargo install --locked cargo-xwin \
 && rm -rf /usr/local/cargo/registry
ENV XWIN_ACCEPT_LICENSE=1 CI=true
COPY build.sh /usr/local/bin/terminux-build
ENTRYPOINT ["terminux-build"]
