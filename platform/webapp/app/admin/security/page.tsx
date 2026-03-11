'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/page-shell';

type AuthHealthResponse = {
  authMode: 'dev-header' | 'trusted-bearer';
  devRoleSwitchEnabled: boolean;
  trustedTokens: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
    warningDays: number;
  };
};

type AuditEvent = {
  eventId: string;
  timestamp: string;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  resource: string;
  actor?: { id?: string; role?: string };
  source?: { operation?: string };
};

type AuthAlert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  recommendation: string;
  metrics: { expired: number; expiringSoon: number; total: number; warningDays: number };
};

type RotationPlanResponse = {
  reason: string;
  checklist: string[];
  overlapWindowGuidance: string;
  validationChecks: string[];
  cutoverCriteria: string[];
  authHealth: AuthHealthResponse['trustedTokens'];
};

type SimInput = { tokenId: string; userId: string; role: 'admin' | 'technician' | 'readonly'; expiresAt: string };

type SimResponse = {
  impact: {
    total: number;
    expired: number;
    expiringSoon: number;
    active: number;
    warningDays: number;
    suggestedPriorityActions: string[];
  };
};

type AuditFilters = {
  limit: number;
  outcome: '' | 'success' | 'failure' | 'denied';
  actionContains: string;
  operationContains: string;
  since: string;
};

type AlertConfig = {
  channels: {
    teams: {
      enabled: boolean;
      webhookUrl: string;
      routes: { authAlerts: boolean; testAlerts: boolean };
      bySeverity: { info: boolean; warning: boolean; critical: boolean };
    };
    email: {
      enabled: boolean;
      smtpHost: string;
      smtpPort: number;
      smtpSecure: boolean;
      smtpUser: string;
      smtpPass: string;
      from: string;
      to: string;
      routes: { authAlerts: boolean; testAlerts: boolean };
      bySeverity: { info: boolean; warning: boolean; critical: boolean };
      recipientGroups: Record<string, string>;
      severityGroupMap: { info?: string; warning?: string; critical?: string };
    };
  };
};

type AlertDecision = { alertId: string; severity: 'info' | 'warning' | 'critical'; deliver: boolean; reason: string; recipients?: string[]; recipientGroup?: string };
type AlertStatus = { channel: 'teams' | 'email'; attempted: boolean; ok: boolean; message: string; decisions?: AlertDecision[] };

const EMPTY_SIM_INPUT: SimInput = { tokenId: '', userId: '', role: 'readonly', expiresAt: '' };
const DEFAULT_FILTERS: AuditFilters = { limit: 50, outcome: '', actionContains: '', operationContains: '', since: '' };
const DEFAULT_ALERT_CONFIG: AlertConfig = {
  channels: {
    teams: { enabled: false, webhookUrl: '', routes: { authAlerts: true, testAlerts: true }, bySeverity: { info: true, warning: true, critical: true } },
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
      bySeverity: { info: true, warning: true, critical: true },
      recipientGroups: {},
      severityGroupMap: {}
    }
  }
};

export default function AdminSecurityPage() {
  const [health, setHealth] = useState<AuthHealthResponse | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [alerts, setAlerts] = useState<AuthAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>(DEFAULT_FILTERS);
  const [auditLoading, setAuditLoading] = useState(false);

  const [planReason, setPlanReason] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RotationPlanResponse | null>(null);

  const [simulateInput, setSimulateInput] = useState<SimInput>(EMPTY_SIM_INPUT);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [simulateResult, setSimulateResult] = useState<SimResponse['impact'] | null>(null);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertActionLoading, setAlertActionLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [recipientGroupsText, setRecipientGroupsText] = useState('');
  const [routingPreview, setRoutingPreview] = useState<AlertStatus[] | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [healthRes, alertsRes, alertConfigRes] = await Promise.all([
          fetch('/api/auth/health', { cache: 'no-store' }),
          fetch('/api/auth/alerts', { cache: 'no-store' }),
          fetch('/api/alerts/config', { cache: 'no-store' })
        ]);

        if (!healthRes.ok) throw new Error(formatAuthError(healthRes.status, 'auth health'));
        if (!alertsRes.ok) throw new Error(formatAuthError(alertsRes.status, 'auth alerts'));
        if (!alertConfigRes.ok) throw new Error(formatAuthError(alertConfigRes.status, 'alert config'));

        const healthData = (await healthRes.json()) as AuthHealthResponse;
        const alertsData = (await alertsRes.json()) as { alerts?: AuthAlert[] };
        const configData = (await alertConfigRes.json()) as { config?: AlertConfig };

        setHealth(healthData);
        setAlerts(alertsData.alerts ?? []);
        const nextConfig = configData.config ?? DEFAULT_ALERT_CONFIG;
        setAlertConfig(nextConfig);
        setRecipientGroupsText(Object.entries(nextConfig.channels.email.recipientGroups).map(([k, v]) => `${k}=${v}`).join('\n'));
        await loadAuditEvents(DEFAULT_FILTERS);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin security data.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function loadAuditEvents(filters: AuditFilters) {
    try {
      setAuditLoading(true);
      const params = new URLSearchParams();
      params.set('limit', String(filters.limit));
      if (filters.outcome) params.set('outcome', filters.outcome);
      if (filters.actionContains.trim()) params.set('actionContains', filters.actionContains.trim());
      if (filters.operationContains.trim()) params.set('operationContains', filters.operationContains.trim());
      if (filters.since.trim()) params.set('since', filters.since.trim());

      const response = await fetch(`/api/audit/events?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(formatAuthError(response.status, 'audit events'));

      const data = (await response.json()) as { items?: AuditEvent[] };
      setEvents(data.items ?? []);
    } finally {
      setAuditLoading(false);
    }
  }

  async function applyAuditFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      await loadAuditEvents(auditFilters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events.');
    }
  }

  const auditCsvHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(auditFilters.limit));
    if (auditFilters.outcome) params.set('outcome', auditFilters.outcome);
    if (auditFilters.actionContains.trim()) params.set('actionContains', auditFilters.actionContains.trim());
    if (auditFilters.operationContains.trim()) params.set('operationContains', auditFilters.operationContains.trim());
    if (auditFilters.since.trim()) params.set('since', auditFilters.since.trim());
    return `/api/audit/events.csv?${params.toString()}`;
  }, [auditFilters]);

  async function requestPlan() {
    try {
      setPlanLoading(true);
      setPlanError(null);
      const response = await fetch('/api/auth/rotation/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: planReason.trim() || undefined })
      });

      if (!response.ok) throw new Error(formatAuthError(response.status, 'rotation plan'));
      const data = (await response.json()) as RotationPlanResponse;
      setPlan(data);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to request rotation plan.');
      setPlan(null);
    } finally {
      setPlanLoading(false);
    }
  }

  async function runSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSimulateLoading(true);
      setSimulateError(null);
      const response = await fetch('/api/auth/rotation/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: [simulateInput] })
      });

      if (!response.ok) throw new Error(formatAuthError(response.status, 'rotation simulate'));
      const data = (await response.json()) as SimResponse;
      setSimulateResult(data.impact);
    } catch (err) {
      setSimulateError(err instanceof Error ? err.message : 'Failed to simulate rotation impact.');
      setSimulateResult(null);
    } finally {
      setSimulateLoading(false);
    }
  }

  async function saveAlertConfig() {
    try {
      setAlertSaving(true);
      setAlertMessage(null);
      const recipientGroups = Object.fromEntries(
        recipientGroupsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, ...rest] = line.split('=');
            return [name.trim(), rest.join('=').trim()];
          })
          .filter(([name]) => Boolean(name))
      );
      const response = await fetch('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...alertConfig,
          channels: {
            ...alertConfig.channels,
            email: { ...alertConfig.channels.email, recipientGroups }
          }
        })
      });
      if (!response.ok) throw new Error(formatAuthError(response.status, 'alert config save'));
      const data = (await response.json()) as { config?: AlertConfig };
      const nextConfig = data.config ?? DEFAULT_ALERT_CONFIG;
      setAlertConfig(nextConfig);
      setRecipientGroupsText(Object.entries(nextConfig.channels.email.recipientGroups).map(([k, v]) => `${k}=${v}`).join('\n'));
      setAlertMessage('Alert channel configuration saved.');
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : 'Failed to save alert config.');
    } finally {
      setAlertSaving(false);
    }
  }

  async function runAlertPreview() {
    try {
      setAlertActionLoading(true);
      setAlertMessage(null);
      const response = await fetch('/api/alerts/preview-routing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'authAlerts', channels: ['teams', 'email'] }) });
      const data = (await response.json()) as { routing?: AlertStatus[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? formatAuthError(response.status, 'alert preview'));
      setRoutingPreview(data.routing ?? []);
      setAlertMessage('Routing preview generated.');
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : 'Alert preview failed.');
      setRoutingPreview(null);
    } finally {
      setAlertActionLoading(false);
    }
  }

  async function runAlertAction(url: string, okLabel: string) {
    try {
      setAlertActionLoading(true);
      setAlertMessage(null);
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: ['teams', 'email'] }) });
      const data = (await response.json()) as { status?: AlertStatus[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? formatAuthError(response.status, 'alert dispatch'));
      setAlertMessage(`${okLabel}: ${(data.status ?? []).map((item) => `${item.channel}=${item.ok ? 'ok' : item.message}`).join(', ') || 'done'}`);
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : 'Alert action failed.');
    } finally {
      setAlertActionLoading(false);
    }
  }

  const showWarnings = (health?.trustedTokens.expired ?? 0) > 0 || (health?.trustedTokens.expiringSoon ?? 0) > 0;

  return (
    <PageShell title="Admin Security" subtitle="Auth posture and latest internal audit trail.">
      {error ? <section className="panel p-5 text-sm text-red-600">{error}</section> : null}

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Auth health</h2>
          {showWarnings ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Action needed</span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Healthy</span>
          )}
        </div>

        {loading || !health ? (
          <p className="mt-3 text-sm text-slate-600">Loading auth health…</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Total" value={health.trustedTokens.total} />
              <Metric label="Active" value={health.trustedTokens.active} />
              <Metric label="Expired" value={health.trustedTokens.expired} tone={health.trustedTokens.expired > 0 ? 'warn' : 'default'} />
              <Metric label="Expiring soon" value={health.trustedTokens.expiringSoon} tone={health.trustedTokens.expiringSoon > 0 ? 'warn' : 'default'} />
              <Metric label="Warning days" value={health.trustedTokens.warningDays} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Mode: <span className="font-mono">{health.authMode}</span> · Dev role switch: {health.devRoleSwitchEnabled ? 'enabled' : 'disabled'}
            </p>
          </>
        )}
      </section>

      <section className="panel p-5 space-y-3">
        <h2 className="text-base font-semibold text-ink">Risk alerts</h2>
        {loading ? <p className="text-sm text-slate-600">Loading alerts…</p> : null}
        {!loading && alerts.length === 0 ? <p className="text-sm text-slate-600">No alerts.</p> : null}
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className={`rounded-xl border p-3 text-sm ${alertTone(alert.severity)}`}>
              <p className="font-semibold">{alert.title}</p>
              <p className="mt-1">{alert.recommendation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5 space-y-3">
        <h2 className="text-base font-semibold text-ink">Rotation Planner</h2>
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Optional reason (e.g. quarterly-rotation)"
          value={planReason}
          onChange={(event) => setPlanReason(event.target.value)}
        />
        <button className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white" onClick={requestPlan} disabled={planLoading}>
          {planLoading ? 'Generating…' : 'Request rotation plan'}
        </button>
        {planError ? <p className="text-sm text-rose-600">{planError}</p> : null}
        {plan ? (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
            <p className="font-semibold">Reason: {plan.reason}</p>
            <p>{plan.overlapWindowGuidance}</p>
            <ul className="list-disc pl-5">{plan.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </section>

      <section className="panel p-5 space-y-3">
        <h2 className="text-base font-semibold text-ink">Rotation Simulator</h2>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={runSimulation}>
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="tokenId" value={simulateInput.tokenId} onChange={(e) => setSimulateInput((v) => ({ ...v, tokenId: e.target.value }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="userId" value={simulateInput.userId} onChange={(e) => setSimulateInput((v) => ({ ...v, userId: e.target.value }))} />
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={simulateInput.role} onChange={(e) => setSimulateInput((v) => ({ ...v, role: e.target.value as SimInput['role'] }))}>
            <option value="readonly">readonly</option>
            <option value="technician">technician</option>
            <option value="admin">admin</option>
          </select>
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="datetime-local" value={simulateInput.expiresAt} onChange={(e) => setSimulateInput((v) => ({ ...v, expiresAt: e.target.value }))} />
          <button type="submit" className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white md:col-span-4" disabled={simulateLoading}>
            {simulateLoading ? 'Simulating…' : 'Run simulation'}
          </button>
        </form>
        {simulateError ? <p className="text-sm text-rose-600">{simulateError}</p> : null}
        {simulateResult ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Total" value={simulateResult.total} />
            <Metric label="Active" value={simulateResult.active} />
            <Metric label="Expired" value={simulateResult.expired} tone={simulateResult.expired > 0 ? 'warn' : 'default'} />
            <Metric label="Expiring soon" value={simulateResult.expiringSoon} tone={simulateResult.expiringSoon > 0 ? 'warn' : 'default'} />
            <Metric label="Warning days" value={simulateResult.warningDays} />
          </div>
        ) : null}
      </section>

      <section className="panel p-5 space-y-3">
        <h2 className="text-base font-semibold text-ink">Alert Channels</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.teams.enabled} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, teams: { ...v.channels.teams, enabled: e.target.checked } } }))} />Enable Teams</label>
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Teams webhook URL" value={alertConfig.channels.teams.webhookUrl} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, teams: { ...v.channels.teams, webhookUrl: e.target.value } } }))} />
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.email.enabled} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, enabled: e.target.checked } } }))} />Enable Email</label>
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="SMTP host" value={alertConfig.channels.email.smtpHost} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, smtpHost: e.target.value } } }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="SMTP port" type="number" value={alertConfig.channels.email.smtpPort} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, smtpPort: Number(e.target.value) || 587 } } }))} />
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.email.smtpSecure} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, smtpSecure: e.target.checked } } }))} />SMTP secure (TLS)</label>
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="SMTP user" value={alertConfig.channels.email.smtpUser} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, smtpUser: e.target.value } } }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="password" placeholder="SMTP password" value={alertConfig.channels.email.smtpPass} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, smtpPass: e.target.value } } }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="From" value={alertConfig.channels.email.from} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, from: e.target.value } } }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Recipients (comma separated)" value={alertConfig.channels.email.to} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, to: e.target.value } } }))} />
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.teams.routes.authAlerts} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, teams: { ...v.channels.teams, routes: { ...v.channels.teams.routes, authAlerts: e.target.checked } } } }))} />Teams auth alerts</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.email.routes.authAlerts} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, routes: { ...v.channels.email.routes, authAlerts: e.target.checked } } } }))} />Email auth alerts</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.teams.routes.testAlerts} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, teams: { ...v.channels.teams, routes: { ...v.channels.teams.routes, testAlerts: e.target.checked } } } }))} />Teams test alerts</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.email.routes.testAlerts} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, routes: { ...v.channels.email.routes, testAlerts: e.target.checked } } } }))} />Email test alerts</label>

          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.teams.bySeverity.info} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, teams: { ...v.channels.teams, bySeverity: { ...v.channels.teams.bySeverity, info: e.target.checked } } } }))} />Teams info</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.teams.bySeverity.warning} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, teams: { ...v.channels.teams, bySeverity: { ...v.channels.teams.bySeverity, warning: e.target.checked } } } }))} />Teams warning</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.teams.bySeverity.critical} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, teams: { ...v.channels.teams, bySeverity: { ...v.channels.teams.bySeverity, critical: e.target.checked } } } }))} />Teams critical</label>

          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.email.bySeverity.info} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, bySeverity: { ...v.channels.email.bySeverity, info: e.target.checked } } } }))} />Email info</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.email.bySeverity.warning} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, bySeverity: { ...v.channels.email.bySeverity, warning: e.target.checked } } } }))} />Email warning</label>
          <label className="text-sm"><input type="checkbox" className="mr-2" checked={alertConfig.channels.email.bySeverity.critical} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, bySeverity: { ...v.channels.email.bySeverity, critical: e.target.checked } } } }))} />Email critical</label>

          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Group for info severity (optional)" value={alertConfig.channels.email.severityGroupMap.info ?? ''} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, severityGroupMap: { ...v.channels.email.severityGroupMap, info: e.target.value } } } }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Group for warning severity (optional)" value={alertConfig.channels.email.severityGroupMap.warning ?? ''} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, severityGroupMap: { ...v.channels.email.severityGroupMap, warning: e.target.value } } } }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Group for critical severity (optional)" value={alertConfig.channels.email.severityGroupMap.critical ?? ''} onChange={(e) => setAlertConfig((v) => ({ ...v, channels: { ...v.channels, email: { ...v.channels.email, severityGroupMap: { ...v.channels.email.severityGroupMap, critical: e.target.value } } } }))} />
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Email recipient groups (one per line: group=mail1@example.com,mail2@example.com)</span>
          <textarea className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={recipientGroupsText} onChange={(e) => setRecipientGroupsText(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white" onClick={saveAlertConfig} disabled={alertSaving}>{alertSaving ? 'Saving…' : 'Save config'}</button>
          <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={runAlertPreview} disabled={alertActionLoading}>Preview routing</button>
          <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => runAlertAction('/api/alerts/test', 'Test sent')} disabled={alertActionLoading}>Send test</button>
          <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => runAlertAction('/api/auth/alerts/dispatch', 'Auth alerts dispatched')} disabled={alertActionLoading}>Dispatch current auth alerts</button>
        </div>
        {alertMessage ? <p className="text-sm text-slate-700">{alertMessage}</p> : null}
        {routingPreview ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-2">
            {routingPreview.map((row) => (
              <div key={row.channel}>
                <p className="font-semibold">{row.channel}: {row.message}</p>
                <ul className="list-disc pl-5">
                  {(row.decisions ?? []).map((d) => (
                    <li key={`${row.channel}-${d.alertId}-${d.severity}`}>{d.alertId} ({d.severity}) → {d.deliver ? 'deliver' : 'skip'} [{d.reason}]</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Latest audit events</h2>
          <a href={auditCsvHref} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
            Export CSV
          </a>
        </div>

        <form className="grid gap-2 md:grid-cols-6" onSubmit={applyAuditFilters}>
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="number" min={1} max={200} value={auditFilters.limit} onChange={(e) => setAuditFilters((v) => ({ ...v, limit: Number(e.target.value) || 50 }))} placeholder="Limit" />
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={auditFilters.outcome} onChange={(e) => setAuditFilters((v) => ({ ...v, outcome: e.target.value as AuditFilters['outcome'] }))}>
            <option value="">Any outcome</option>
            <option value="success">success</option>
            <option value="failure">failure</option>
            <option value="denied">denied</option>
          </select>
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Action contains" value={auditFilters.actionContains} onChange={(e) => setAuditFilters((v) => ({ ...v, actionContains: e.target.value }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Operation contains" value={auditFilters.operationContains} onChange={(e) => setAuditFilters((v) => ({ ...v, operationContains: e.target.value }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="datetime-local" value={auditFilters.since} onChange={(e) => setAuditFilters((v) => ({ ...v, since: e.target.value }))} />
          <button className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white" type="submit" disabled={auditLoading}>{auditLoading ? 'Loading…' : 'Apply filters'}</button>
        </form>

        {loading || auditLoading ? (
          <p className="text-sm text-slate-600">Loading audit events…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="table-head"><th className="px-3 py-2">Time</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Outcome</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Operation</th></tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.eventId} className="bg-slate-50 text-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(event.timestamp).toISOString().replace('T', ' ').slice(0, 19)} UTC</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.action}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${outcomeTone(event.outcome)}`}>{event.outcome}</span></td>
                    <td className="px-3 py-2">{event.actor?.id ?? 'n/a'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.source?.operation ?? event.resource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function formatAuthError(status: number, target: string) {
  if (status === 401) return `Unauthorized while loading ${target}. Please authenticate and retry.`;
  if (status === 403) return `Forbidden while loading ${target}. Admin role is required.`;
  if (status === 400) return `Bad request while loading ${target}. Verify metadata-only payload.`;
  return `Failed to load ${target} (${status}).`;
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warn' }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function outcomeTone(outcome: AuditEvent['outcome']) {
  if (outcome === 'success') return 'bg-emerald-100 text-emerald-800';
  if (outcome === 'failure') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-800';
}

function alertTone(severity: AuthAlert['severity']) {
  if (severity === 'critical') return 'border-rose-200 bg-rose-50 text-rose-900';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-emerald-200 bg-emerald-50 text-emerald-900';
}
