#!/usr/bin/env bash
set -euo pipefail

# GMZ Cloud Business Apps - Proxmox API bootstrap helper
# Run on a Proxmox node as root.

REALM="pve"
USER_NAME="gmz-automation"
USER="${USER_NAME}@${REALM}"
TOKEN_ID="gmz-control-plane"
ROLE_NAME="GMZAutomation"

# Adjust as needed (broad permissions by design, per project requirement)
PRIVS="VM.Allocate VM.Clone VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network VM.Config.Options VM.Console VM.Migrate VM.Monitor VM.PowerMgmt Datastore.Allocate Datastore.AllocateSpace Datastore.Audit SDN.Use Sys.Audit"

echo "==> Creating role ${ROLE_NAME}"
pveum role add "${ROLE_NAME}" -privs "${PRIVS}" || true

echo "==> Creating user ${USER}"
pveum user add "${USER}" || true

echo "==> Assign role on / (Datacenter)"
pveum aclmod / -user "${USER}" -role "${ROLE_NAME}"

echo "==> Creating API token ${TOKEN_ID}"
pveum user token add "${USER}" "${TOKEN_ID}" --privsep 0

echo
echo "Done. Copy token value now and store securely in GMZ Setup Wizard."
echo "User: ${USER}"
echo "Token ID: ${TOKEN_ID}"
