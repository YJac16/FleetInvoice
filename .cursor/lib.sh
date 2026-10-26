#!/usr/bin/env bash
# Shared helpers for the WorkOps Cloud Agent environment scripts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\n\033[1;34m[env]\033[0m %s\n' "$*"; }

# Start the Docker daemon if it is not already running, and make its socket
# usable by the current (non-root) user. Tuned for the nested Cloud Agent VM:
# fuse-overlayfs storage driver + legacy iptables.
ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "docker binary missing — run the install step first" >&2
    return 1
  fi

  if ! sudo test -S /var/run/docker.sock || ! sudo docker info >/dev/null 2>&1; then
    log "Starting dockerd..."
    sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
    sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true
    sudo mkdir -p /etc/docker
    echo '{"storage-driver":"fuse-overlayfs","iptables":true}' | sudo tee /etc/docker/daemon.json >/dev/null
    sudo nohup dockerd >/tmp/dockerd.log 2>&1 &
    for _ in $(seq 1 30); do
      sudo docker info >/dev/null 2>&1 && break
      sleep 1
    done
  fi

  # Let the agent user talk to the daemon without sudo.
  sudo groupadd -f docker
  sudo usermod -aG docker "$(id -un)" >/dev/null 2>&1 || true
  sudo chmod 666 /var/run/docker.sock || true

  docker info >/dev/null 2>&1 || { log "docker daemon not reachable" >&2; return 1; }
  log "Docker is up (storage: $(docker info --format '{{.Driver}}' 2>/dev/null))."
}

# Print the running local-Supabase DB container name (empty if none).
supabase_db_container() {
  docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -1
}
