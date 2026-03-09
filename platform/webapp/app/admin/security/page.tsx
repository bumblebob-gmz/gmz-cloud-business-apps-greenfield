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

const EMPTY_SIM_INPUT: SimInput = { tokenId: '', userId: '', role: 'readonly', expiresAt: '' };

export default function AdminSecurityPage() {
  const [health, setHealth] = useState<AuthHealthResponse | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');

  const [planReason, setPlanReason] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RotationPlanResponse | null>(null);

  const [simulateInput, setSimulateInput] = useState<SimInput>(EMPTY_SIM_INPUT);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [simulateResult, setSimulateResult] = useState<SimResponse['impact'] | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [healthRes, auditRes] = await Promise.all([
          fetch('/api/auth/health', { cache: 'no-store' }),
          fetch('/api/audit/events?limit=50', { cache: 'no-store' })
        ]);

        if (!healthRes.ok) throw new Error(formatAuthError(healthRes.status, 'auth health'));
        if (!auditRes.ok) throw new Error(formatAuthError(auditRes.status, 'audit events'));

        const healthData = (await healthRes.json()) as AuthHealthResponse;
        const auditData = (await auditRes.json()) as { items?: AuditEvent[] };

        setHealth(healthData);
        setEvents(auditData.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin security data.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const actionOk = event.action.toLowerCase().includes(actionFilter.trim().toLowerCase());
        const outcomeOk = event.outcome.toLowerCase().includes(outcomeFilter.trim().toLowerCase());
        return actionOk && outcomeOk;
      }),
    [events, actionFilter, outcomeFilter]
  );

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

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Latest audit events</h2>
          <div className="flex flex-wrap gap-2">
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Filter action…" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Filter outcome…" value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)} />
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading audit events…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="table-head"><th className="px-3 py-2">Time</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Outcome</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Operation</th></tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.eventId} className="bg-slate-50 text-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(event.timestamp).toLocaleString()}</td>
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
