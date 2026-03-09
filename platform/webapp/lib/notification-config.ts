import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const DATA_DIR = path.join(process.cwd(), '.data');
const CONFIG_FILE = path.join(DATA_DIR, 'notification-config.json');

const MASK = '********';

type RouteToggles = {
  authAlerts: boolean;
  testAlerts: boolean;
};

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type SeverityRouting = {
  info: boolean;
  warning: boolean;
  critical: boolean;
};

export type TeamsConfig = {
  enabled: boolean;
  webhookUrl: string;
  routes: RouteToggles;
  bySeverity: SeverityRouting;
};

export type EmailConfig = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  from: string;
  to: string;
  routes: RouteToggles;
  bySeverity: SeverityRouting;
  recipientGroups: Record<string, string>;
  severityGroupMap: Partial<Record<AlertSeverity, string>>;
};

export type NotificationConfig = {
  channels: {
    teams: TeamsConfig;
    email: EmailConfig;
  };
};

const DEFAULT_SEVERITY_ROUTING: SeverityRouting = { info: true, warning: true, critical: true };

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  channels: {
    teams: {
      enabled: false,
      webhookUrl: '',
      routes: { authAlerts: true, testAlerts: true },
      bySeverity: { ...DEFAULT_SEVERITY_ROUTING }
    },
    email: {
      enabled: false,
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      from: '',
      to: '',
      routes: { authAlerts: true, testAlerts: true },
      bySeverity: { ...DEFAULT_SEVERITY_ROUTING },
      recipientGroups: {},
      severityGroupMap: {}
    }
  }
};

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toStringSafe(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function toPort(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

function sanitizeRoutes(input: unknown, fallback: RouteToggles): RouteToggles {
  const candidate = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    authAlerts: toBool(candidate.authAlerts, fallback.authAlerts),
    testAlerts: toBool(candidate.testAlerts, fallback.testAlerts)
  };
}

function sanitizeSeverityRouting(input: unknown, fallback: SeverityRouting): SeverityRouting {
  const candidate = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    info: toBool(candidate.info, fallback.info),
    warning: toBool(candidate.warning, fallback.warning),
    critical: toBool(candidate.critical, fallback.critical)
  };
}

function sanitizeRecipientGroups(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const next: Record<string, string> = {};
  for (const [group, recipients] of Object.entries(input as Record<string, unknown>)) {
    const normalizedGroup = group.trim();
    if (!normalizedGroup) continue;
    next[normalizedGroup] = toStringSafe(recipients);
  }
  return next;
}

function sanitizeSeverityGroupMap(input: unknown): Partial<Record<AlertSeverity, string>> {
  const candidate = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    info: toStringSafe(candidate.info),
    warning: toStringSafe(candidate.warning),
    critical: toStringSafe(candidate.critical)
  };
}

function sanitizeConfig(input: unknown): NotificationConfig {
  const root = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const channels = root.channels && typeof root.channels === 'object' ? root.channels as Record<string, unknown> : {};

  const teamsIn = channels.teams && typeof channels.teams === 'object' ? channels.teams as Record<string, unknown> : {};
  const emailIn = channels.email && typeof channels.email === 'object' ? channels.email as Record<string, unknown> : {};

  return {
    channels: {
      teams: {
        enabled: toBool(teamsIn.enabled, DEFAULT_NOTIFICATION_CONFIG.channels.teams.enabled),
        webhookUrl: toStringSafe(teamsIn.webhookUrl),
        routes: sanitizeRoutes(teamsIn.routes, DEFAULT_NOTIFICATION_CONFIG.channels.teams.routes),
        bySeverity: sanitizeSeverityRouting(teamsIn.bySeverity, DEFAULT_NOTIFICATION_CONFIG.channels.teams.bySeverity)
      },
      email: {
        enabled: toBool(emailIn.enabled, DEFAULT_NOTIFICATION_CONFIG.channels.email.enabled),
        smtpHost: toStringSafe(emailIn.smtpHost),
        smtpPort: toPort(emailIn.smtpPort, DEFAULT_NOTIFICATION_CONFIG.channels.email.smtpPort),
        smtpSecure: toBool(emailIn.smtpSecure, DEFAULT_NOTIFICATION_CONFIG.channels.email.smtpSecure),
        smtpUser: toStringSafe(emailIn.smtpUser),
        smtpPass: toStringSafe(emailIn.smtpPass),
        from: toStringSafe(emailIn.from),
        to: toStringSafe(emailIn.to),
        routes: sanitizeRoutes(emailIn.routes, DEFAULT_NOTIFICATION_CONFIG.channels.email.routes),
        bySeverity: sanitizeSeverityRouting(emailIn.bySeverity, DEFAULT_NOTIFICATION_CONFIG.channels.email.bySeverity),
        recipientGroups: sanitizeRecipientGroups(emailIn.recipientGroups),
        severityGroupMap: sanitizeSeverityGroupMap(emailIn.severityGroupMap)
      }
    }
  };
}

export async function readNotificationConfig(): Promise<NotificationConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_NOTIFICATION_CONFIG);
  }
}

export async function writeNotificationConfig(config: NotificationConfig): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, `${JSON.stringify(sanitizeConfig(config), null, 2)}\n`, 'utf8');
}

export async function updateNotificationConfig(patch: Partial<NotificationConfig>): Promise<NotificationConfig> {
  const current = await readNotificationConfig();
  const next = sanitizeConfig({
    channels: {
      teams: {
        ...current.channels.teams,
        ...(patch.channels?.teams ?? {})
      },
      email: {
        ...current.channels.email,
        ...(patch.channels?.email ?? {})
      }
    }
  });

  if (patch.channels?.teams && typeof patch.channels.teams === 'object') {
    next.channels.teams.routes = {
      ...current.channels.teams.routes,
      ...(patch.channels.teams.routes ?? {})
    };
    next.channels.teams.bySeverity = {
      ...current.channels.teams.bySeverity,
      ...(patch.channels.teams.bySeverity ?? {})
    };
  }

  if (patch.channels?.email && typeof patch.channels.email === 'object') {
    next.channels.email.routes = {
      ...current.channels.email.routes,
      ...(patch.channels.email.routes ?? {})
    };
    next.channels.email.bySeverity = {
      ...current.channels.email.bySeverity,
      ...(patch.channels.email.bySeverity ?? {})
    };
    next.channels.email.recipientGroups = {
      ...current.channels.email.recipientGroups,
      ...(patch.channels.email.recipientGroups ?? {})
    };
    next.channels.email.severityGroupMap = {
      ...current.channels.email.severityGroupMap,
      ...(patch.channels.email.severityGroupMap ?? {})
    };

    if (typeof patch.channels.email.smtpPass === 'string' && patch.channels.email.smtpPass === MASK) {
      next.channels.email.smtpPass = current.channels.email.smtpPass;
    }
  }

  if (patch.channels?.teams && typeof patch.channels.teams.webhookUrl === 'string' && patch.channels.teams.webhookUrl === MASK) {
    next.channels.teams.webhookUrl = current.channels.teams.webhookUrl;
  }

  await writeNotificationConfig(next);
  return next;
}

function maskSecret(value: string): string {
  return value ? MASK : '';
}

export function maskNotificationConfig(config: NotificationConfig): NotificationConfig {
  return {
    channels: {
      teams: {
        ...config.channels.teams,
        webhookUrl: maskSecret(config.channels.teams.webhookUrl)
      },
      email: {
        ...config.channels.email,
        smtpPass: maskSecret(config.channels.email.smtpPass)
      }
    }
  };
}

export function parseNotificationConfigPatch(input: unknown): Partial<NotificationConfig> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Partial<NotificationConfig>;
}
