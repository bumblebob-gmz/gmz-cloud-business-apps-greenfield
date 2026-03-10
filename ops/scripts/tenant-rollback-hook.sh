#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?HOST required}"
USER="${2:-debian}"
SNAPSHOT="${3:-}"

echo "[rollback] Connecting to ${USER}@${HOST} ..." >&2

if [[ -n "${SNAPSHOT}" ]]; then
  ssh -o StrictHostKeyChecking=yes "${USER}@${HOST}" \
    "sudo /opt/gmz/ops/scripts/restore-snapshot.sh '${SNAPSHOT}'"
else
  echo "[rollback] No snapshot specified, skipping restore." >&2
fi

echo "[rollback] Done." >&2
