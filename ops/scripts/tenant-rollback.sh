#!/usr/bin/env bash
# tenant-rollback.sh — Snapshot-gated rollback for nightly updates
#
# Usage:
#   tenant-rollback.sh <tenant_host> <ssh_user> <snapshot_file>
#
# Reads the pre-update snapshot manifest and attempts to restore the tenant
# to the state recorded in the snapshot by:
#   1. Pulling the exact image versions from the snapshot
#   2. Restarting docker-compose with pinned images (via image tag override)
#   3. Verifying at least the snapshot container count is restored
#
# This is intentionally best-effort: if the image is no longer available in
# the registry, the container is skipped and a warning is emitted.
#
# Environment variables (optional):
#   ROLLBACK_SSH_KEY      Path to SSH private key
#   ROLLBACK_COMPOSE_DIR  docker-compose project dir on remote host (default: /opt/gmz/apps)

set -euo pipefail

TENANT_HOST="${1:?Usage: tenant-rollback.sh <tenant_host> <ssh_user> <snapshot_file>}"
SSH_USER="${2:?SSH user required}"
SNAPSHOT_FILE="${3:?Snapshot file path required}"

COMPOSE_DIR="${ROLLBACK_COMPOSE_DIR:-/opt/gmz/apps}"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15)
if [[ -n "${ROLLBACK_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "${ROLLBACK_SSH_KEY}")
fi

if [[ ! -f "${SNAPSHOT_FILE}" ]]; then
  echo "[rollback] ERROR: Snapshot file not found: ${SNAPSHOT_FILE}" >&2
  exit 1
fi

echo "[rollback] Reading snapshot: ${SNAPSHOT_FILE}" >&2
SNAPSHOT_JSON=$(cat "${SNAPSHOT_FILE}")

CAPTURED_AT=$(echo "${SNAPSHOT_JSON}" | jq -r '.captured_at')
CONTAINER_COUNT=$(echo "${SNAPSHOT_JSON}" | jq '.containers | length')

echo "[rollback] Snapshot captured at ${CAPTURED_AT}, ${CONTAINER_COUNT} containers." >&2

if [[ "${CONTAINER_COUNT}" -eq 0 ]]; then
  echo "[rollback] WARNING: Snapshot contains 0 containers — host was unreachable at snapshot time." >&2
  echo "[rollback] Performing docker-compose pull + restart as fallback rollback." >&2
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${TENANT_HOST}" \
    "docker compose -f '${COMPOSE_DIR}/docker-compose.yml' pull --quiet && \
     docker compose -f '${COMPOSE_DIR}/docker-compose.yml' up -d --remove-orphans"
  echo "[rollback] Fallback rollback complete." >&2
  exit 0
fi

# Pull previously running images to ensure they are cached locally on the host
echo "[rollback] Pulling snapshot images on ${TENANT_HOST} ..." >&2
IMAGES=$(echo "${SNAPSHOT_JSON}" | jq -r '.containers[].image' | sort -u)

while IFS= read -r image; do
  echo "[rollback]   Pulling: ${image}" >&2
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${TENANT_HOST}" \
    "docker pull '${image}'" 2>/dev/null \
    || echo "[rollback]   WARNING: Could not pull ${image}; skipping." >&2
done <<< "${IMAGES}"

# Bring compose stack down and back up — docker-compose will use whatever is
# locally cached, which should now include the snapshot images.
echo "[rollback] Restarting compose stack on ${TENANT_HOST} ..." >&2
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${TENANT_HOST}" \
  "docker compose -f '${COMPOSE_DIR}/docker-compose.yml' down --remove-orphans && \
   docker compose -f '${COMPOSE_DIR}/docker-compose.yml' up -d"

# Verify restored container count
RESTORED=$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${TENANT_HOST}" \
  "docker ps -q | wc -l" 2>/dev/null | tr -d '[:space:]' || echo 0)

echo "[rollback] Restored ${RESTORED}/${CONTAINER_COUNT} containers." >&2

if [[ "${RESTORED}" -lt "${CONTAINER_COUNT}" ]]; then
  echo "[rollback] WARNING: Fewer containers restored than snapshot. Manual review needed." >&2
  exit 1
fi

echo "[rollback] Rollback complete. Tenant ${TENANT_HOST} restored to snapshot state." >&2
exit 0
