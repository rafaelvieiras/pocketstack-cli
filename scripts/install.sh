#!/bin/sh
# PocketStack CLI installer.
#
#   curl -fsSL https://raw.githubusercontent.com/rafaelvieiras/pocketstack-cli/main/scripts/install.sh | sh
#
# Environment variables:
#   POCKETSTACK_VERSION      version to install (e.g. 0.1.0); default: latest
#   POCKETSTACK_INSTALL_DIR  install directory; default: /usr/local/bin or ~/.local/bin
set -eu

REPO="rafaelvieiras/pocketstack-cli"
BIN_NAME="pocketstack"
VERSION="${POCKETSTACK_VERSION:-latest}"
INSTALL_DIR="${POCKETSTACK_INSTALL_DIR:-}"

err() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
info() { printf '\033[36m›\033[0m %s\n' "$1" >&2; }

command -v curl >/dev/null 2>&1 || err "curl is required to install ${BIN_NAME}."

os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *) err "unsupported OS '$os'. Install via npm instead: npm install -g pocketstack-cli" ;;
esac
case "$arch" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) err "unsupported architecture '$arch'." ;;
esac

asset="${BIN_NAME}-${os}-${arch}"
if [ "$VERSION" = "latest" ]; then
  url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
  tag="$VERSION"
  case "$tag" in v*) ;; *) tag="v${tag}" ;; esac
  url="https://github.com/${REPO}/releases/download/${tag}/${asset}"
fi

if [ -z "$INSTALL_DIR" ]; then
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
    INSTALL_DIR="/usr/local/bin"
  else
    INSTALL_DIR="${HOME}/.local/bin"
  fi
fi
mkdir -p "$INSTALL_DIR"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
info "Downloading ${asset} (${VERSION})…"
curl -fsSL "$url" -o "$tmp" || err "download failed: ${url}"
chmod +x "$tmp"

dest="${INSTALL_DIR}/${BIN_NAME}"
if mv "$tmp" "$dest" 2>/dev/null; then
  :
elif command -v sudo >/dev/null 2>&1; then
  info "Installing to ${dest} (requires sudo)…"
  sudo mv "$tmp" "$dest" || err "could not install to ${dest}"
else
  err "could not write to ${dest}. Set POCKETSTACK_INSTALL_DIR to a writable path."
fi

info "Installed ${BIN_NAME} to ${dest}"
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    info "Add ${INSTALL_DIR} to your PATH:"
    printf '    export PATH="%s:$PATH"\n' "$INSTALL_DIR" >&2
    ;;
esac
info "Done. Run '${BIN_NAME} login' to get started."
