#!/usr/bin/env bash
# install.sh — Download and install Stasium from GitHub Releases.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/modoterra/stasium/main/install.sh | bash
#   curl -fsSL ... | bash -s -- --version v0.1.0 --prefix /usr/local/bin

set -euo pipefail

REPO="modoterra/stasium"
INSTALL_DIR="${HOME}/.local/bin"
VERSION=""

usage() {
  cat <<EOF
Usage: install.sh [OPTIONS]

Options:
  --version VERSION   Install a specific version (default: latest)
  --prefix  DIR       Installation directory (default: ~/.local/bin)
  -h, --help          Show this help
EOF
}

# --- Parse args ---

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --prefix)  INSTALL_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# --- Detect platform ---

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
if [[ "$OS" != "linux" ]]; then
  echo "Error: Stasium only supports Linux (detected: $OS)" >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  *)
    echo "Error: unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

# --- Resolve version ---

if [[ -z "$VERSION" ]]; then
  echo "Fetching latest release..."
  # /releases/latest excludes pre-releases; fall back to the first entry in /releases
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=1" \
    | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
  if [[ -z "$VERSION" ]]; then
    echo "Error: could not determine latest version" >&2
    exit 1
  fi
fi

echo "Installing stasium ${VERSION} (${OS}/${ARCH})"

# --- Download ---

# Strip leading 'v' for the archive name (goreleaser convention)
V="${VERSION#v}"
ARCHIVE="stasium_${V}_${OS}_${ARCH}.tar.gz"
BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading ${ARCHIVE}..."
curl -fsSL -o "${TMPDIR}/${ARCHIVE}" "${BASE_URL}/${ARCHIVE}"
curl -fsSL -o "${TMPDIR}/checksums.txt" "${BASE_URL}/checksums.txt"

# --- Verify checksum ---

echo "Verifying checksum..."
EXPECTED="$(grep "${ARCHIVE}" "${TMPDIR}/checksums.txt" | awk '{print $1}')"
if [[ -z "$EXPECTED" ]]; then
  echo "Error: archive not found in checksums.txt" >&2
  exit 1
fi

ACTUAL="$(sha256sum "${TMPDIR}/${ARCHIVE}" | awk '{print $1}')"
if [[ "$EXPECTED" != "$ACTUAL" ]]; then
  echo "Error: checksum mismatch" >&2
  echo "  expected: ${EXPECTED}" >&2
  echo "  actual:   ${ACTUAL}" >&2
  exit 1
fi

echo "Checksum OK"

# --- Extract and install ---

mkdir -p "$INSTALL_DIR"
tar -xzf "${TMPDIR}/${ARCHIVE}" -C "$TMPDIR"

for bin in stasium stasiumd; do
  if [[ -f "${TMPDIR}/${bin}" ]]; then
    install -m 755 "${TMPDIR}/${bin}" "${INSTALL_DIR}/${bin}"
    echo "Installed ${INSTALL_DIR}/${bin}"
  fi
done

# --- PATH hint ---

if ! echo ":${PATH}:" | grep -q ":${INSTALL_DIR}:"; then
  echo ""
  echo "Add ${INSTALL_DIR} to your PATH:"
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  echo ""
  echo "To make it permanent, add the line above to your ~/.bashrc or ~/.zshrc"
fi

echo ""
echo "stasium ${VERSION} installed successfully!"
echo "Run 'stasium manifest init laravel --root .' in a project to get started."
