'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function AdminSecurityPage() {
  const [health, setHealth] = useState<AuthHealthResponse | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [healthRes, auditRes] = await Promise.all([
          fetch('/api/auth/health', { cache: 'no-store' }),
          fetch('/api/audit/events?limit=50', { cache: 'no-store' })
        ]);

        if (!healthRes.ok) {
          if (healthRes.status === 401) throw new Error('Unauthorized. Please authenticate to view admin security details.');
          if (healthRes.status === 403) throw new Error('Forbidden. Admin role is required to view auth health.');
          throw new Error(`Failed to load auth health (${healthRes.status}).`);
        }

        if (!auditRes.ok) {
          if (auditRes.status === 401) throw new Error('Unauthorized. Please authenticate to view audit events.');
          if (auditRes.status === 403) throw new Error('Forbidden. Admin role is required to view audit events.');
          throw new Error(`Failed to load audit events (${auditRes.status}).`);
        }

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

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const actionOk = event.action.toLowerCase().includes(actionFilter.trim().toLowerCase());
      const outcomeOk = event.outcome.toLowerCase().includes(outcomeFilter.trim().toLowerCase());
      return actionOk && outcomeOk;
    });
  }, [events, actionFilter, outcomeFilter]);

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
              <Metric
                label="Expiring soon"
                value={health.trustedTokens.expiringSoon}
                tone={health.trustedTokens.expiringSoon > 0 ? 'warn' : 'default'}
              />
              <Metric label="Warning days" value={health.trustedTokens.warningDays} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Mode: <span className="font-mono">{health.authMode}</span> · Dev role switch: {health.devRoleSwitchEnabled ? 'enabled' : 'disabled'}
            </p>
          </>
        )}
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Latest audit events</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Filter action…"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Filter outcome…"
              value={outcomeFilter}
              onChange={(event) => setOutcomeFilter(event.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading audit events…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Operation</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.eventId} className="bg-slate-50 text-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(event.timestamp).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.action}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${outcomeTone(event.outcome)}`}>{event.outcome}</span>
                    </td>
                    <td className="px-3 py-2">{event.actor?.id ?? 'n/a'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.source?.operation ?? event.resource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEvents.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No matching events.</p> : null}
          </div>
        )}
      </section>
    </PageShell>
  );
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
