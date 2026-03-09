const FORBIDDEN_SECRET_KEY_PATTERN = /(token|password|secret)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findForbiddenSecretKeys(payload: unknown, path = ''): string[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item, index) => findForbiddenSecretKeys(item, `${path}[${index}]`));
  }

  if (!isRecord(payload)) {
    return [];
  }

  const hits: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_SECRET_KEY_PATTERN.test(key)) {
      hits.push(currentPath);
    }
    hits.push(...findForbiddenSecretKeys(value, currentPath));
  }

  return hits;
}

export function getExecutionSecretPresence() {
  const envKeys = ['PROVISION_PROXMOX_ENDPOINT', 'PROVISION_PROXMOX_API_TOKEN', 'PROVISION_DEFAULT_SSH_PUBLIC_KEY'] as const;

  return envKeys.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = Boolean(process.env[key] && process.env[key]?.trim().length);
    return acc;
  }, {});
}
