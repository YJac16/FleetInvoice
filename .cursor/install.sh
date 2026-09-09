#!/usr/bin/env bash
#
# WorkOps Cloud Agent — install phase.
#
# Idempotent, one-time repository + toolchain preparation. Runs after the
# repository is checked out and (with environment builds) bakes the result into
# the environment snapshot. No long-running services are started here; per-boot
# services live in .cursor/start.sh and the `terminals` entry.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib.sh"
cd "$REPO_ROOT"

# --- 1. System packages needed to run a local Supabase stack -----------------
# Docker (for the Supabase containers), fuse-overlayfs + legacy iptables for the
# nested Cloud Agent VM, and psql for the grant/verify helpers.
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker and supporting packages..."
  export DEBIAN_FRONTEND=noninteractive
  # Prevent maintainer scripts from trying to start services under a non-systemd PID 1.
  printf '#!/bin/sh\nexit 101\n' | sudo tee /usr/sbin/policy-rc.d >/dev/null
  sudo chmod +x /usr/sbin/policy-rc.d
  sudo apt-get update
  # --force-confold keeps existing conffiles (e.g. /etc/fuse.conf) without prompting.
  sudo apt-get install -y -o Dpkg::Options::=--force-confold \
    docker.io fuse-overlayfs uidmap iptables postgresql-client
fi

# --- 2. Docker configuration for the nested VM -------------------------------
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true
sudo mkdir -p /etc/docker
echo '{"storage-driver":"fuse-overlayfs","iptables":true}' | sudo tee /etc/docker/daemon.json >/dev/null
sudo groupadd -f docker
sudo usermod -aG docker "$(id -un)" >/dev/null 2>&1 || true

# --- 3. Node dependencies -----------------------------------------------------
log "Installing Node dependencies (npm ci)..."
npm ci

# --- 4. Pre-pull the Supabase images so first boot is fast (best effort) ------
# This bakes the ~10 Supabase container images into the snapshot. It must not
# fail the build if the daemon or network is unavailable.
if ensure_docker; then
  log "Pre-pulling Supabase images..."
  # Start from a clean slate so image pulls actually run even if a previous
  # snapshot left containers behind, then tear the stack down so start.sh can
  # bring it up freshly on each boot. Never fail the build on this best-effort step.
  npx --yes supabase stop --no-backup >/dev/null 2>&1 || true
  npx --yes supabase start >/tmp/supabase-prepull.log 2>&1 || \
    log "Supabase pre-pull skipped/failed (start.sh will retry on boot)."
  npx --yes supabase stop --no-backup >/dev/null 2>&1 || true
fi

log "install complete."
