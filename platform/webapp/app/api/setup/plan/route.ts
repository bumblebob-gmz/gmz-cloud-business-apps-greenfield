import { NextResponse } from 'next/server';
import { requireOperationRole } from '@/lib/auth-context';

type SetupPlanRequest = {
  preflight?: {
    managementVmName?: string;
    managementVmIp?: string;
    targetNode?: string;
    vlan?: string;
    dnsResolver?: string;
    ntpServer?: string;
  };
  proxmox?: {
    endpoint?: string;
    username?: string;
    tokenId?: string;
    tokenSecret?: string;
    vmStorage?: string;
    networkBridge?: string;
  };
  ionos?: {
    datacenterId?: string;
    region?: string;
    contractId?: string;
    apiPublicKey?: string;
    apiPrivateKey?: string;
  };
  bootstrap?: {
    bootstrapUser?: string;
    sshPort?: string;
    installK3s?: boolean;
    services?: string[];
  };
  validation?: {
    runConnectivityTests?: boolean;
    runBackupSmokeTest?: boolean;
    enforceTls?: boolean;
    readinessTimeoutMinutes?: string;
  };
};

function maskSecret(secret?: string, keep = 2) {
  if (!secret) return 'not provided';
  if (secret.length <= keep) return '*'.repeat(secret.length);
  const visible = secret.slice(-keep);
  return `${'*'.repeat(Math.max(secret.length - keep, 4))}${visible}`;
}

function maskIdentifier(value?: string) {
  if (!value) return 'not provided';
  if (value.length <= 5) return `${value[0]}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export async function POST(request: Request) {
  const authz = requireOperationRole(request, 'POST /api/setup/plan');
  if (!authz.ok) return authz.response;

  const body = (await request.json()) as SetupPlanRequest;

  if (!body.preflight?.managementVmName || !body.preflight.managementVmIp || !body.preflight.targetNode) {
    return NextResponse.json({ error: 'Preflight details are required (name, IP, target node).' }, { status: 400 });
  }

  if (!body.proxmox?.endpoint || !body.proxmox.username) {
    return NextResponse.json({ error: 'Proxmox endpoint and username are required.' }, { status: 400 });
  }

  if (!body.ionos?.datacenterId || !body.ionos.region) {
    return NextResponse.json({ error: 'IONOS datacenter and region are required.' }, { status: 400 });
  }

  const readinessTimeout = Number(body.validation?.readinessTimeoutMinutes ?? '20');

  const requiredChecks = [
    `Confirm Proxmox API reachability: ${body.proxmox.endpoint}`,
    `Validate target node '${body.preflight.targetNode}' has capacity for ${body.preflight.managementVmName}`,
    `Verify VLAN ${body.preflight.vlan ?? 'N/A'} and bridge ${body.proxmox.networkBridge ?? 'N/A'} routing`,
    `Verify IONOS datacenter ${body.ionos.datacenterId} in region ${body.ionos.region}`,
    `Confirm DNS ${body.preflight.dnsResolver ?? 'N/A'} and NTP ${body.preflight.ntpServer ?? 'N/A'} for management VM`,
    `Run post-bootstrap readiness checks within ${Number.isFinite(readinessTimeout) ? readinessTimeout : 20} minutes`
  ];

  if (body.validation?.runBackupSmokeTest) {
    requiredChecks.push('Backup smoke test enabled: verify snapshot + restore metadata path');
  }

  if (body.validation?.enforceTls) {
    requiredChecks.push('TLS enforcement enabled: certificate trust chain + SAN checks must pass');
  }

  const services = body.bootstrap?.services?.length ? body.bootstrap.services.join(' ') : 'traefik postgresql';

  const suggestedCommands = [
    `ping -c 2 ${body.preflight.managementVmIp}`,
    `curl -sk ${body.proxmox.endpoint}/version`,
    `qm list --full | grep -i ${body.preflight.managementVmName}`,
    `ansible-playbook ops/bootstrap-management-vm.yml -e target=${body.preflight.managementVmName} -e vm_ip=${body.preflight.managementVmIp}`,
    `./scripts/bootstrap-services.sh --host ${body.preflight.managementVmIp} --services "${services}" --user ${body.bootstrap?.bootstrapUser ?? 'ops-admin'}`,
    `./scripts/validate-management-stack.sh --host ${body.preflight.managementVmIp} --timeout ${Number.isFinite(readinessTimeout) ? readinessTimeout : 20}`
  ];

  if (body.bootstrap?.installK3s) {
    suggestedCommands.push(`curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --tls-san ${body.preflight.managementVmIp}" sh -`);
  }

  if (body.validation?.runConnectivityTests) {
    suggestedCommands.push(`./scripts/network-smoke.sh --target ${body.preflight.managementVmIp} --dns ${body.preflight.dnsResolver ?? '1.1.1.1'}`);
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    environmentLabel: `${body.preflight.managementVmName}-${body.ionos.region}`,
    plan: {
      requiredChecks,
      suggestedCommands,
      maskedCredentialSummary: {
        proxmoxEndpoint: body.proxmox.endpoint,
        proxmoxUser: maskIdentifier(body.proxmox.username),
        proxmoxTokenId: maskIdentifier(body.proxmox.tokenId),
        proxmoxTokenSecret: maskSecret(body.proxmox.tokenSecret),
        ionosPublicKey: maskSecret(body.ionos.apiPublicKey),
        ionosPrivateKey: maskSecret(body.ionos.apiPrivateKey),
        contractId: maskIdentifier(body.ionos.contractId),
        datacenterId: maskIdentifier(body.ionos.datacenterId)
      }
    }
  });
}
