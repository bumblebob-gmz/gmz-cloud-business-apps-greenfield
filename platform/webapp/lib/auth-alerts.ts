import type { TrustedTokenHealthSummary } from './auth-core';

export type AuthAlert = {
  id: 'tokens-expired' | 'tokens-expiring-soon' | 'tokens-healthy';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  recommendation: string;
  metrics: {
    expired: number;
    expiringSoon: number;
    total: number;
    warningDays: number;
  };
};

export function buildAuthAlerts(summary: TrustedTokenHealthSummary): AuthAlert[] {
  const metrics = {
    expired: summary.expired,
    expiringSoon: summary.expiringSoon,
    total: summary.total,
    warningDays: summary.warningDays
  };

  const alerts: AuthAlert[] = [];

  if (summary.expired > 0) {
    alerts.push({
      id: 'tokens-expired',
      severity: 'critical',
      title: `${summary.expired} trusted token(s) expired`,
      recommendation: 'Rotate expired tokens immediately and remove stale credentials from WEBAPP_TRUSTED_TOKENS_JSON.',
      metrics
    });
  }

  if (summary.expiringSoon > 0) {
    alerts.push({
      id: 'tokens-expiring-soon',
      severity: 'warning',
      title: `${summary.expiringSoon} trusted token(s) expiring within ${summary.warningDays} day(s)`,
      recommendation: 'Stage replacement tokens now, verify admin paths, then cut over before expiry.',
      metrics
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'tokens-healthy',
      severity: 'info',
      title: 'Trusted bearer token posture is healthy',
      recommendation: 'Continue periodic rotation and keep warning window monitoring enabled.',
      metrics
    });
  }

  return alerts;
}
