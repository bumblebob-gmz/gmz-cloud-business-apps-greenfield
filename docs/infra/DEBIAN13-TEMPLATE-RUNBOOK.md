# Debian 13 Cloud-Init Template Runbook (Proxmox)

This runbook documents a practical, repeatable way to build and refresh the **Debian 13 cloud-init template** used by `infra/opentofu/environments/prod`.

## Scope

- Proxmox VE host has `qm` and internet access.
- Resulting template ID should match `debian_template_id` in your tenant tfvars.
- Storage target should match your selected tenant profile (`lvm-thin` or `ceph`).

## Recommended defaults (adjust per cluster)

- Template VMID: `9000`
- Template name: `debian-13-cloudinit`
- Cloud image: `debian-13-generic-amd64.qcow2`
- Snippets storage: `local` (for cloud-init snippets if needed)

## 1) Download latest Debian 13 cloud image

```bash
cd /var/lib/vz/template/iso
wget -O debian-13-generic-amd64.qcow2 \
  https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2
```

## 2) (Re)create base VM shell

> If VMID already exists and should be rebuilt: stop it and remove it first.

```bash
qm stop 9000 || true
qm destroy 9000 --purge || true

qm create 9000 \
  --name debian-13-cloudinit \
  --memory 2048 \
  --cores 2 \
  --net0 virtio,bridge=vmbr0 \
  --serial0 socket \
  --vga serial0 \
  --agent enabled=1
```

## 3) Import disk to chosen datastore

### LVM-Thin example

```bash
qm importdisk 9000 /var/lib/vz/template/iso/debian-13-generic-amd64.qcow2 local-lvm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0
```

### Ceph example

```bash
qm importdisk 9000 /var/lib/vz/template/iso/debian-13-generic-amd64.qcow2 ceph-vm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 ceph-vm:vm-9000-disk-0
```

## 4) Add cloud-init drive + boot order

```bash
qm set 9000 --ide2 local-lvm:cloudinit
qm set 9000 --boot c --bootdisk scsi0
qm set 9000 --ipconfig0 ip=dhcp
```

If `local-lvm:cloudinit` is unavailable in your cluster, use a datastore that supports snippets/cloud-init.

## 5) Optional hardening defaults on template VM config

```bash
qm set 9000 --ciuser debian
qm set 9000 --sshkeys ~/.ssh/id_ed25519.pub
```

(Per-tenant values are normally injected by OpenTofu, so keep template generic.)

## 6) Convert VM to template

```bash
qm template 9000
```

## 7) Validate clone workflow

Quick validation:

```bash
qm clone 9000 19000 --name template-test-19000 --full 1
qm start 19000
# verify boot + DHCP + SSH cloud-init
qm stop 19000
qm destroy 19000 --purge
```

## 8) Update process (monthly or after security advisories)

1. Download fresh Debian 13 cloud image.
2. Rebuild template with same VMID (`9000`) using steps above.
3. Run clone smoke test.
4. Keep `debian_template_id` unchanged in tfvars when VMID is stable.

## Operational notes for this project

- `infra/opentofu/environments/prod/terraform.tfvars.example` uses `debian_template_id = 9000`.
- For wizard-driven placement, ensure profile datastore (`node_storage_profiles[*].storage`) is compatible with imported template disks.
- CI blocks insecure prod tfvars templates (`proxmox_insecure=true`).
