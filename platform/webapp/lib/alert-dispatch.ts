import nodemailer from 'nodemailer';
import type { AuthAlert } from './auth-alerts';
import type { AlertSeverity, NotificationConfig } from './notification-config';

export type AlertDispatchReason = 'authAlerts' | 'testAlerts';

export type AlertChannelDecision = {
  alertId: AuthAlert['id'];
  severity: AlertSeverity;
  deliver: boolean;
  reason: string;
  recipients?: string[];
  recipientGroup?: string;
};

export type ChannelSendStatus = {
  channel: 'teams' | 'email';
  attempted: boolean;
  ok: boolean;
  message: string;
  decisions: AlertChannelDecision[];
};

function shouldRoute(enabled: boolean, routeToggle: boolean) {
  return enabled && routeToggle;
}

function severityEnabled(config: NotificationConfig, channel: 'teams' | 'email', severity: AlertSeverity): boolean {
  return channel === 'teams'
    ? config.channels.teams.bySeverity[severity]
    : config.channels.email.bySeverity[severity];
}

export function shouldDispatchChannel(config: NotificationConfig, channel: 'teams' | 'email', reason: AlertDispatchReason): boolean {
  if (channel === 'teams') {
    return shouldRoute(config.channels.teams.enabled, config.channels.teams.routes[reason]);
  }
  return shouldRoute(config.channels.email.enabled, config.channels.email.routes[reason]);
}

function parseRecipients(raw: string) {
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function resolveEmailRecipients(config: NotificationConfig, severity: AlertSeverity) {
  const group = config.channels.email.severityGroupMap[severity]?.trim() || '';
  const groupRecipientsRaw = group ? (config.channels.email.recipientGroups[group] ?? '') : '';
  const groupRecipients = parseRecipients(groupRecipientsRaw);
  if (groupRecipients.length > 0) {
    return { recipients: groupRecipients, recipientGroup: group };
  }
  return { recipients: parseRecipients(config.channels.email.to), recipientGroup: undefined };
}

export function computeRoutingStatus(params: {
  config: NotificationConfig;
  reason: AlertDispatchReason;
  alerts: AuthAlert[];
  selectedChannels?: Array<'teams' | 'email'>;
}): ChannelSendStatus[] {
  const selected = new Set(params.selectedChannels ?? ['teams', 'email']);
  const statuses: ChannelSendStatus[] = [];

  for (const channel of ['teams', 'email'] as const) {
    if (!selected.has(channel)) continue;

    const channelEnabledForRoute = shouldDispatchChannel(params.config, channel, params.reason);
    const decisions: AlertChannelDecision[] = params.alerts.map((alert) => {
      if (!channelEnabledForRoute) {
        return { alertId: alert.id, severity: alert.severity, deliver: false, reason: 'route_disabled' };
      }
      if (!severityEnabled(params.config, channel, alert.severity)) {
        return { alertId: alert.id, severity: alert.severity, deliver: false, reason: 'severity_disabled' };
      }
      if (channel === 'email') {
        const { recipients, recipientGroup } = resolveEmailRecipients(params.config, alert.severity);
        if (recipients.length === 0) {
          return { alertId: alert.id, severity: alert.severity, deliver: false, reason: 'recipients_missing' };
        }
        return { alertId: alert.id, severity: alert.severity, deliver: true, reason: 'deliver', recipients, recipientGroup };
      }
      return { alertId: alert.id, severity: alert.severity, deliver: true, reason: 'deliver' };
    });

    const anyDeliver = decisions.some((item) => item.deliver);
    statuses.push({
      channel,
      attempted: false,
      ok: false,
      message: channelEnabledForRoute ? (anyDeliver ? 'Ready to deliver.' : 'No alerts match current severity routing.') : `${channel} disabled for this route.`,
      decisions
    });
  }

  return statuses;
}

function toTeamsFacts(alerts: AuthAlert[]) {
  return alerts.map((alert) => ({
    name: `${alert.severity.toUpperCase()} · ${alert.title}`,
    value: alert.recommendation
  }));
}

export async function sendTeamsAlert(config: NotificationConfig, title: string, alerts: AuthAlert[], decisions: AlertChannelDecision[]): Promise<ChannelSendStatus> {
  const webhook = config.channels.teams.webhookUrl.trim();
  if (!webhook) return { channel: 'teams', attempted: false, ok: false, message: 'Teams webhook missing.', decisions };

  const severity = alerts.some((item) => item.severity === 'critical') ? 'critical' : alerts.some((item) => item.severity === 'warning') ? 'warning' : 'info';

  const payload = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: severity === 'critical' ? 'd13438' : severity === 'warning' ? 'ffb900' : '107c10',
    summary: title,
    title,
    sections: [{ facts: toTeamsFacts(alerts), markdown: true }]
  };

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { channel: 'teams', attempted: true, ok: false, message: `Teams webhook failed (${response.status}).`, decisions };
  }

  return { channel: 'teams', attempted: true, ok: true, message: 'Teams alert sent.', decisions };
}

export async function sendEmailAlert(config: NotificationConfig, subject: string, alerts: AuthAlert[], decisions: AlertChannelDecision[]): Promise<ChannelSendStatus> {
  const channel = config.channels.email;
  if (!channel.smtpHost || !channel.from) {
    return { channel: 'email', attempted: false, ok: false, message: 'Email SMTP host/from required.', decisions };
  }

  const perAlertRecipients = new Map<string, string[]>();
  for (const decision of decisions) {
    if (decision.deliver && decision.recipients && decision.recipients.length > 0) {
      perAlertRecipients.set(decision.alertId, decision.recipients);
    }
  }
  const allRecipients = Array.from(new Set(Array.from(perAlertRecipients.values()).flat()));
  if (allRecipients.length === 0) {
    return { channel: 'email', attempted: false, ok: false, message: 'Email recipients missing.', decisions };
  }

  const transporter = nodemailer.createTransport({
    host: channel.smtpHost,
    port: channel.smtpPort,
    secure: channel.smtpSecure || channel.smtpPort === 465,
    requireTLS: !channel.smtpSecure && channel.smtpPort !== 25,
    auth: channel.smtpUser ? { user: channel.smtpUser, pass: channel.smtpPass } : undefined,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });

  const text = alerts.map((alert) => {
    const recipients = perAlertRecipients.get(alert.id) ?? [];
    const route = recipients.length > 0 ? ` (to: ${recipients.join(', ')})` : '';
    return `- [${alert.severity.toUpperCase()}] ${alert.title}${route}\n  ${alert.recommendation}`;
  }).join('\n\n');

  await transporter.sendMail({
    from: channel.from,
    to: allRecipients,
    subject,
    text: `${subject}\n\n${text}`
  });

  return { channel: 'email', attempted: true, ok: true, message: 'Email alert sent.', decisions };
}

export async function dispatchAlertsToConfiguredChannels(params: {
  config: NotificationConfig;
  reason: AlertDispatchReason;
  subject: string;
  alerts: AuthAlert[];
  selectedChannels?: Array<'teams' | 'email'>;
}): Promise<ChannelSendStatus[]> {
  const matrix = computeRoutingStatus(params);
  const byId = new Map(params.alerts.map((alert) => [alert.id, alert] as const));

  const statuses: ChannelSendStatus[] = [];
  for (const status of matrix) {
    const routedAlerts = status.decisions
      .filter((decision) => decision.deliver)
      .map((decision) => byId.get(decision.alertId))
      .filter((item): item is AuthAlert => Boolean(item));

    if (routedAlerts.length === 0) {
      statuses.push({ ...status, attempted: false, ok: false, message: 'No alerts match routing rules.' });
      continue;
    }

    if (status.channel === 'teams') {
      statuses.push(await sendTeamsAlert(params.config, params.subject, routedAlerts, status.decisions));
    } else {
      statuses.push(await sendEmailAlert(params.config, params.subject, routedAlerts, status.decisions));
    }
  }

  return statuses;
}
