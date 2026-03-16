#!/usr/bin/env bash
set -euo pipefail

OPENVLT_HOME="${OPENVLT_HOME:-$HOME/.openvlt}"
APP_DIR="$OPENVLT_HOME/app"
LOG_DIR="$OPENVLT_HOME/logs"
BIN_DIR="$OPENVLT_HOME/bin"
REPO_URL="https://github.com/openvlt/openvlt.git"
DEFAULT_PORT=3456

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

print_banner() {
  echo ""
  echo -e "${BOLD}  ╔═══════════════════════════════════╗${NC}"
  echo -e "${BOLD}  ║         OpenVlt Installer          ║${NC}"
  echo -e "${BOLD}  ╚═══════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "  ${DIM}→${NC} $*"; }
success() { echo -e "  ${GREEN}✓${NC} $*"; }
warn()    { echo -e "  ${YELLOW}!${NC} $*"; }
fail()    { echo -e "  ${RED}✗${NC} $*"; exit 1; }

detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)  echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

detect_shell_profile() {
  if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
    echo "$HOME/.zshrc"
  elif [ -n "${BASH_VERSION:-}" ] || [ "$(basename "$SHELL")" = "bash" ]; then
    echo "$HOME/.bashrc"
  else
    echo "$HOME/.profile"
  fi
}

# ─── Check & install Node.js ───────────────────────────────────────────────

install_node() {
  if command -v node &>/dev/null; then
    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -ge 20 ]; then
      success "Node.js $(node -v) found"
      return 0
    else
      warn "Node.js $(node -v) is too old (need v20+)"
    fi
  fi

  info "Installing Node.js..."
  local os
  os=$(detect_os)

  if [ "$os" = "macos" ]; then
    if command -v brew &>/dev/null; then
      brew install node
    else
      fail "Install Node.js v20+ from https://nodejs.org or install Homebrew first"
    fi
  elif [ "$os" = "linux" ]; then
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
      sudo dnf install -y nodejs
    else
      fail "Install Node.js v20+ from https://nodejs.org"
    fi
  else
    fail "Install Node.js v20+ from https://nodejs.org"
  fi

  success "Node.js installed: $(node -v)"
}

# ─── Check & install bun ───────────────────────────────────────────────────

install_bun() {
  if command -v bun &>/dev/null; then
    success "bun $(bun -v) found"
    return 0
  fi

  info "Installing bun..."
  curl -fsSL https://bun.sh/install | bash

  # Source bun into current shell
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if command -v bun &>/dev/null; then
    success "bun installed: $(bun -v)"
  else
    fail "bun installation failed. Install manually: https://bun.sh"
  fi
}

# ─── Check & install pm2 ──────────────────────────────────────────────────

install_pm2() {
  if command -v pm2 &>/dev/null; then
    success "pm2 $(pm2 -v 2>/dev/null || echo '?') found"
    return 0
  fi

  info "Installing pm2..."
  npm install -g pm2

  if command -v pm2 &>/dev/null; then
    success "pm2 installed"
  else
    fail "pm2 installation failed. Try: npm install -g pm2"
  fi
}

# ─── Clone & build ────────────────────────────────────────────────────────

clone_and_build() {
  mkdir -p "$OPENVLT_HOME"
  mkdir -p "$LOG_DIR"

  if [ -d "$APP_DIR" ]; then
    warn "Existing installation found at $APP_DIR"
    read -rp "  Reinstall? This will rebuild the app. Your data is safe. (y/N) " confirm
    if [[ "$confirm" != [yY] ]]; then
      echo "  Cancelled."
      exit 0
    fi
    info "Pulling latest..."
    cd "$APP_DIR"
    git pull --ff-only origin main
  else
    info "Cloning OpenVlt..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  fi

  info "Installing dependencies..."
  bun install --frozen-lockfile

  info "Building (this may take a minute)..."
  bun run build

  # Set up standalone output
  if [ -d ".next/standalone" ]; then
    cp -r .next/standalone/* .
    # Ensure static files and public assets are in the right place
    mkdir -p .next/standalone/.next
    cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
    cp -r public .next/standalone/public 2>/dev/null || true
  fi

  success "Build complete"
}

# ─── Install CLI ──────────────────────────────────────────────────────────

install_cli() {
  mkdir -p "$BIN_DIR"
  cp "$APP_DIR/bin/openvlt" "$BIN_DIR/openvlt"
  chmod +x "$BIN_DIR/openvlt"

  # Add to PATH if not already there
  local shell_profile
  shell_profile=$(detect_shell_profile)

  if ! grep -q "openvlt/bin" "$shell_profile" 2>/dev/null; then
    echo "" >> "$shell_profile"
    echo "# OpenVlt" >> "$shell_profile"
    echo 'export PATH="$HOME/.openvlt/bin:$PATH"' >> "$shell_profile"
    success "Added openvlt to PATH in $shell_profile"
  else
    success "PATH already configured"
  fi

  export PATH="$BIN_DIR:$PATH"
}

# ─── Setup pm2 startup ───────────────────────────────────────────────────

setup_startup() {
  info "Configuring auto-start on boot..."

  local os
  os=$(detect_os)

  if [ "$os" = "macos" ]; then
    pm2 startup launchd -u "$USER" --hp "$HOME" 2>/dev/null || true
  elif [ "$os" = "linux" ]; then
    # pm2 startup prints a command the user needs to run with sudo
    local startup_cmd
    startup_cmd=$(pm2 startup 2>/dev/null | grep "sudo" | head -1) || true
    if [ -n "$startup_cmd" ]; then
      info "Running startup command..."
      eval "$startup_cmd" 2>/dev/null || warn "Auto-start setup needs sudo. Run manually: $startup_cmd"
    fi
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────

main() {
  print_banner

  echo -e "  ${DIM}Installing to $OPENVLT_HOME${NC}"
  echo ""

  # Step 1: Dependencies
  echo -e "  ${BOLD}Dependencies${NC}"
  install_node
  install_bun
  install_pm2
  echo ""

  # Step 2: Clone & build
  echo -e "  ${BOLD}Application${NC}"
  clone_and_build
  echo ""

  # Step 3: CLI
  echo -e "  ${BOLD}CLI${NC}"
  install_cli
  echo ""

  # Step 4: Start the server
  echo -e "  ${BOLD}Starting OpenVlt${NC}"
  cd "$APP_DIR"
  OPENVLT_PORT="$DEFAULT_PORT" pm2 start ecosystem.config.cjs --env production
  pm2 save
  echo "$DEFAULT_PORT" > "$OPENVLT_HOME/.port"
  success "Server started on port $DEFAULT_PORT"
  echo ""

  # Step 5: Setup startup
  setup_startup
  pm2 save 2>/dev/null || true
  echo ""

  # Done
  echo -e "  ${BOLD}${GREEN}════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${GREEN}OpenVlt is running!${NC}"
  echo ""
  echo -e "  ${BOLD}Open:${NC}  http://localhost:$DEFAULT_PORT"
  echo ""
  echo -e "  ${DIM}Commands:${NC}"
  echo -e "    openvlt status     ${DIM}— Check status${NC}"
  echo -e "    openvlt stop       ${DIM}— Stop server${NC}"
  echo -e "    openvlt start      ${DIM}— Start server${NC}"
  echo -e "    openvlt update     ${DIM}— Update to latest${NC}"
  echo -e "    openvlt logs       ${DIM}— View logs${NC}"
  echo -e "    openvlt help       ${DIM}— All commands${NC}"
  echo ""
  echo -e "  ${DIM}Restart your terminal or run:${NC}"
  echo -e "  ${CYAN}source $(detect_shell_profile)${NC}"
  echo ""
}

main "$@"
