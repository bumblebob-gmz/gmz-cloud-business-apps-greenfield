#!/usr/bin/env bash
# tenant-healthcheck.sh — Post-update health gate
#
# Usage:
#   tenant-healthcheck.sh <tenant_host> <ssh_user>
#
# Checks that Docker is reachable and that all expected containers are running
# on the tenant host. Exits 0 on success, non-zero on failure.
#
# Environment variables (optional):
#   HEALTHCHECK_SSH_KEY       Path to SSH private key
#   HEALTHCHECK_MIN_RUNNING   Minimum number of running containers (default: 1)
#   HEALTHCHECK_TIMEOUT       SSH connect timeout in seconds (default: 15)
#   HEALTHCHECK_RETRIES       How many times to retry on transient failure (default: 3)
#   HEALTHCHECK_RETRY_DELAY   Seconds between retries (default: 10)

set -euo pipefail

TENANT_HOST="${1:?Usage: tenant-healthcheck.sh <tenant_host> <ssh_user>}"
SSH_USER="${2:?SSH user required}"
MIN_RUNNING="${HEALTHCHECK_MIN_RUNNING:-1}"
TIMEOUT="${HEALTHCHECK_TIMEOUT:-15}"
RETRIES="${HEALTHCHECK_RETRIES:-3}"
RETRY_DELAY="${HEALTHCHECK_RETRY_DELAY:-10}"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout="${TIMEOUT}")
if [[ -n "${HEALTHCHECK_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "${HEALTHCHECK_SSH_KEY}")
fi

attempt=0
while true; do
  attempt=$(( attempt + 1 ))
  echo "[healthcheck] Attempt ${attempt}/${RETRIES}: checking ${SSH_USER}@${TENANT_HOST} ..." >&2

  # Step 1: Docker daemon reachable
  if ! ssh "${SSH_OPTS[@]}" "${SSH_USER}@${TENANT_HOST}" "docker info > /dev/null 2>&1" 2>/dev/null; then
    echo "[healthcheck] FAIL: Docker daemon unreachable on ${TENANT_HOST}." >&2
  else
    # Step 2: Container count meets minimum
    RUNNING=$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${TENANT_HOST}" \
      "docker ps -q | wc -l" 2>/dev/null | tr -d '[:space:]' || echo 0)

    echo "[healthcheck] Running containers: ${RUNNING} (min required: ${MIN_RUNNING})" >&2

    if [[ "${RUNNING}" -ge "${MIN_RUNNING}" ]]; then
      echo "[healthcheck] PASS: ${TENANT_HOST} is healthy." >&2
      exit 0
    fi

    echo "[healthcheck] FAIL: Only ${RUNNING}/${MIN_RUNNING} containers running on ${TENANT_HOST}." >&2
  fi

  if [[ "${attempt}" -ge "${RETRIES}" ]]; then
    echo "[healthcheck] FAIL: Health check failed after ${RETRIES} attempts." >&2
    exit 1
  fi

  echo "[healthcheck] Retrying in ${RETRY_DELAY}s ..." >&2
  sleep "${RETRY_DELAY}"
done
