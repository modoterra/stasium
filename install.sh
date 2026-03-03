#!/bin/sh
# Stasium installer for Linux and macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/modoterra/stasium/main/install.sh | sh

set -eu

REPO="modoterra/stasium"
INSTALL_DIR="${INSTALL_DIR:-}"
GITHUB_API="https://api.github.com"
GITHUB_DOWNLOAD="https://github.com"

main() {
  parse_args "$@"

  os=$(detect_os)
  arch=$(detect_arch)
  target="${os}-${arch}"

  if [ -z "$INSTALL_DIR" ]; then
    if [ "$(id -u)" = "0" ]; then
      INSTALL_DIR="/usr/local/bin"
    else
      INSTALL_DIR="${HOME}/.local/bin"
    fi
  fi

  tag=$(get_latest_tag)
  binary="stasium-${target}"
  url="${GITHUB_DOWNLOAD}/${REPO}/releases/download/${tag}/${binary}"
  checksums_url="${GITHUB_DOWNLOAD}/${REPO}/releases/download/${tag}/checksums.txt"

  printf "Installing stasium %s (%s) to %s\n" "$tag" "$target" "$INSTALL_DIR"

  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT

  download "$url" "${tmpdir}/${binary}"
  download "$checksums_url" "${tmpdir}/checksums.txt"

  verify_checksum "${tmpdir}" "${binary}"

  mkdir -p "$INSTALL_DIR"
  mv "${tmpdir}/${binary}" "${INSTALL_DIR}/stasium"
  chmod +x "${INSTALL_DIR}/stasium"

  printf "Installed stasium %s to %s/stasium\n" "$tag" "$INSTALL_DIR"
  check_path "$INSTALL_DIR"
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)
        INSTALL_DIR="$2"
        shift 2
        ;;
      --dir=*)
        INSTALL_DIR="${1#--dir=}"
        shift
        ;;
      --help)
        printf "Usage: install.sh [--dir <path>]\n"
        printf "\n"
        printf "Options:\n"
        printf "  --dir <path>  Installation directory (default: ~/.local/bin or /usr/local/bin as root)\n"
        exit 0
        ;;
      *)
        printf "Unknown option: %s\n" "$1" >&2
        exit 1
        ;;
    esac
  done
}

detect_os() {
  case "$(uname -s)" in
    Linux*)  printf "linux" ;;
    Darwin*) printf "macos" ;;
    *)
      printf "Unsupported operating system: %s\n" "$(uname -s)" >&2
      printf "Use install.ps1 for Windows.\n" >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)   printf "x64" ;;
    aarch64|arm64)   printf "arm64" ;;
    *)
      printf "Unsupported architecture: %s\n" "$(uname -m)" >&2
      exit 1
      ;;
  esac
}

get_latest_tag() {
  url="${GITHUB_API}/repos/${REPO}/releases/latest"
  if command -v curl > /dev/null 2>&1; then
    tag=$(curl -fsSL "$url" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/')
  elif command -v wget > /dev/null 2>&1; then
    tag=$(wget -qO- "$url" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/')
  else
    printf "Error: curl or wget is required\n" >&2
    exit 1
  fi

  if [ -z "$tag" ]; then
    printf "Error: could not determine latest release\n" >&2
    exit 1
  fi

  printf "%s" "$tag"
}

download() {
  src="$1"
  dst="$2"
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL -o "$dst" "$src"
  elif command -v wget > /dev/null 2>&1; then
    wget -qO "$dst" "$src"
  else
    printf "Error: curl or wget is required\n" >&2
    exit 1
  fi
}

verify_checksum() {
  dir="$1"
  file="$2"
  expected=$(grep "$file" "${dir}/checksums.txt" | awk '{ print $1 }')

  if [ -z "$expected" ]; then
    printf "Warning: no checksum found for %s, skipping verification\n" "$file" >&2
    return
  fi

  if command -v sha256sum > /dev/null 2>&1; then
    actual=$(sha256sum "${dir}/${file}" | awk '{ print $1 }')
  elif command -v shasum > /dev/null 2>&1; then
    actual=$(shasum -a 256 "${dir}/${file}" | awk '{ print $1 }')
  else
    printf "Warning: sha256sum or shasum not found, skipping verification\n" >&2
    return
  fi

  if [ "$expected" != "$actual" ]; then
    printf "Error: checksum mismatch for %s\n" "$file" >&2
    printf "  expected: %s\n" "$expected" >&2
    printf "  actual:   %s\n" "$actual" >&2
    exit 1
  fi

  printf "Checksum verified.\n"
}

check_path() {
  dir="$1"
  case ":${PATH}:" in
    *":${dir}:"*) ;;
    *)
      printf "\n"
      printf "Note: %s is not in your PATH.\n" "$dir"
      printf "Add it by running:\n"
      printf "\n"
      printf "  export PATH=\"%s:\$PATH\"\n" "$dir"
      printf "\n"
      printf "To make this permanent, add the line above to your shell profile\n"
      printf "(e.g., ~/.bashrc, ~/.zshrc, or ~/.profile).\n"
      ;;
  esac
}

main "$@"
