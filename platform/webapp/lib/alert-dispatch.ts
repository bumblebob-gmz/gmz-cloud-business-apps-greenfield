import nodemailer from 'nodemailer';
import type { AuthAlert } from './auth-alerts';
import type { NotificationConfig } from './notification-config';

export type AlertDispatchReason = 'authAlerts' | 'testAlerts';

export type ChannelSendStatus = {
  channel: 'teams' | 'email';
  attempted: boolean;
  ok: boolean;
  message: string;
};

function shouldRoute(enabled: boolean, routeToggle: boolean) {
  return enabled && routeToggle;
}

export function shouldDispatchChannel(config: NotificationConfig, channel: 'teams' | 'email', reason: AlertDispatchReason): boolean {
  if (channel === 'teams') {
    return shouldRoute(config.channels.teams.enabled, config.channels.teams.routes[reason]);
  }
  return shouldRoute(config.channels.email.enabled, config.channels.email.routes[reason]);
}

function toTeamsFacts(alerts: AuthAlert[]) {
  return alerts.map((alert) => ({
    name: `${alert.severity.toUpperCase()} · ${alert.title}`,
    value: alert.recommendation
  }));
}

export async function sendTeamsAlert(config: NotificationConfig, title: string, alerts: AuthAlert[]): Promise<ChannelSendStatus> {
  const webhook = config.channels.teams.webhookUrl.trim();
  if (!webhook) return { channel: 'teams', attempted: false, ok: false, message: 'Teams webhook missing.' };

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
    return { channel: 'teams', attempted: true, ok: false, message: `Teams webhook failed (${response.status}).` };
  }

  return { channel: 'teams', attempted: true, ok: true, message: 'Teams alert sent.' };
}

function parseRecipients(raw: string) {
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export async function sendEmailAlert(config: NotificationConfig, subject: string, alerts: AuthAlert[]): Promise<ChannelSendStatus> {
  const channel = config.channels.email;
  if (!channel.smtpHost || !channel.from || !channel.to) {
    return { channel: 'email', attempted: false, ok: false, message: 'Email SMTP host/from/to required.' };
  }

  const recipients = parseRecipients(channel.to);
  if (recipients.length === 0) {
    return { channel: 'email', attempted: false, ok: false, message: 'Email recipients missing.' };
  }

  const transporter = nodemailer.createTransport({
    host: channel.smtpHost,
    port: channel.smtpPort,
    secure: channel.smtpSecure || channel.smtpPort === 465,
    requireTLS: !channel.smtpSecure && channel.smtpPort !== 25,
    auth: channel.smtpUser ? { user: channel.smtpUser, pass: channel.smtpPass } : undefined,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });

  const text = alerts.map((alert) => `- [${alert.severity.toUpperCase()}] ${alert.title}\n  ${alert.recommendation}`).join('\n\n');
  await transporter.sendMail({
    from: channel.from,
    to: recipients,
    subject,
    text: `${subject}\n\n${text}`
  });

  return { channel: 'email', attempted: true, ok: true, message: 'Email alert sent.' };
}

export async function dispatchAlertsToConfiguredChannels(params: {
  config: NotificationConfig;
  reason: AlertDispatchReason;
  subject: string;
  alerts: AuthAlert[];
  selectedChannels?: Array<'teams' | 'email'>;
}): Promise<ChannelSendStatus[]> {
  const selected = new Set(params.selectedChannels ?? ['teams', 'email']);
  const statuses: ChannelSendStatus[] = [];

  if (selected.has('teams')) {
    if (!shouldDispatchChannel(params.config, 'teams', params.reason)) {
      statuses.push({ channel: 'teams', attempted: false, ok: false, message: 'Teams disabled for this route.' });
    } else {
      statuses.push(await sendTeamsAlert(params.config, params.subject, params.alerts));
    }
  }

  if (selected.has('email')) {
    if (!shouldDispatchChannel(params.config, 'email', params.reason)) {
      statuses.push({ channel: 'email', attempted: false, ok: false, message: 'Email disabled for this route.' });
    } else {
      statuses.push(await sendEmailAlert(params.config, params.subject, params.alerts));
    }
  }

  return statuses;
}
