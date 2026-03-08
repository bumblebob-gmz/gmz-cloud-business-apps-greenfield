# Domain Model (v1)

## Hauptobjekte
- Tenant
- TenantVM
- AppDeployment
- MaintenanceWindow
- IdentityConnector
- SecretRef
- JobRun
- AuditEvent
- Report

## Tenant (Kernfelder)
- id
- name
- slug
- vlan_id
- vm_size (S/M/L/XL)
- vm_ip (`10.<vlan>.10.100`)
- auth_mode (entra|ldap|local)
- maintenance_window
- status

## AppDeployment
- tenant_id
- app_id
- catalog_version
- config_hash
- health_status
- last_update_at

## JobRun
- type (provision|deploy|update|report)
- tenant_id
- status
- started_at/finished_at
- logs_ref
