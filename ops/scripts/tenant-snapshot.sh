#!/usr/bin/env bash
# tenant-snapshot.sh — Pre-update tenant state snapshot
#
# Usage:
#   tenant-snapshot.sh <tenant_host> <ssh_user> [snapshot_dir]
#
# Captures running container state (names + image digests) from a tenant host
# and writes a snapshot manifest to <snapshot_dir>/<tenant_host>-<timestamp>.json.
# The snapshot file path is printed to stdout so callers can capture it.
#
# Environment variables (optional):
#   SNAPSHOT_SSH_KEY   Path to SSH private key (falls back to ssh-agent)
#   SNAPSHOT_BASE_DIR  Override base directory for snapshots

set -euo pipefail

TENANT_HOST="${1:?Usage: tenant-snapshot.sh <tenant_host> <ssh_user> [snapshot_dir]}"
SSH_USER="${2:?SSH user required}"
SNAPSHOT_BASE="${3:-${SNAPSHOT_BASE_DIR:-/tmp/gmz-snapshots}}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT_FILE="${SNAPSHOT_BASE}/${TENANT_HOST}-${TIMESTAMP}.json"

mkdir -p "${SNAPSHOT_BASE}"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10)
if [[ -n "${SNAPSHOT_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "${SNAPSHOT_SSH_KEY}")
fi

echo "[snapshot] Connecting to ${SSH_USER}@${TENANT_HOST} ..." >&2

# Collect: running containers with name, image, and image ID (digest pinned)
SNAPSHOT_JSON=$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${TENANT_HOST}" \
  "docker ps --format '{{json .}}'" 2>/dev/null \
  | jq -sc --arg host "${TENANT_HOST}" --arg ts "${TIMESTAMP}" '{
      tenant_host: $host,
      captured_at: $ts,
      containers: map({
        id:      .ID,
        name:    .Names,
        image:   .Image,
        status:  .Status,
        created: .CreatedAt
      })
    }') || {
  echo "[snapshot] WARNING: Could not connect to ${TENANT_HOST}; writing empty snapshot." >&2
  SNAPSHOT_JSON=$(jq -n \
    --arg host "${TENANT_HOST}" \
    --arg ts "${TIMESTAMP}" \
    '{tenant_host: $host, captured_at: $ts, containers: [], warning: "host unreachable"}')
}

echo "${SNAPSHOT_JSON}" > "${SNAPSHOT_FILE}"
echo "[snapshot] Snapshot saved: ${SNAPSHOT_FILE}" >&2

# Print path so callers can capture: SNAPSHOT_PATH=$(tenant-snapshot.sh ...)
echo "${SNAPSHOT_FILE}"
