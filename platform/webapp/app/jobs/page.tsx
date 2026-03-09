'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import type { Job, JobStatus, ProvisionPreflight, Tenant } from '@/lib/types';

const statuses: JobStatus[] = ['Queued', 'Running', 'Success', 'Failed', 'DryRun'];

type CreateJobForm = {
  tenant: string;
  task: string;
  status: JobStatus;
};

type ProvisionResult = {
  mode: 'dry-run' | 'execute';
  correlationId: string;
  message?: string;
  success?: boolean;
  plan: { commands: string[] };
  job: Job;
};

const initialForm: CreateJobForm = {
  tenant: '',
  task: '',
  status: 'Queued'
};

export default function JobsPage() {
  const [items, setItems] = useState<Job[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [form, setForm] = useState<CreateJobForm>(initialForm);
  const [preflight, setPreflight] = useState<ProvisionPreflight | null>(null);
  const [executeMode, setExecuteMode] = useState(false);

  async function loadJobs() {
    const response = await fetch('/api/jobs', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load jobs (${response.status})`);
    const data = (await response.json()) as { items: Job[] };
    setItems(data.items ?? []);
  }

  async function loadTenants() {
    const response = await fetch('/api/tenants', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load tenants (${response.status})`);
    const data = (await response.json()) as { items: Tenant[] };
    const tenantItems = data.items ?? [];
    setTenants(tenantItems);
    if (!selectedTenantId && tenantItems[0]) setSelectedTenantId(tenantItems[0].id);
  }

  async function loadPreflight() {
    const response = await fetch('/api/provision/preflight', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load execution readiness (${response.status})`);
    const data = (await response.json()) as ProvisionPreflight;
    setPreflight(data);
    if (!data.ready) setExecuteMode(false);
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadJobs(), loadTenants(), loadPreflight()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.tenant.trim() || !form.task.trim()) {
      setError('Tenant and task are required.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: form.tenant.trim(),
          task: form.task.trim(),
          status: form.status
        })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to create job (${response.status})`);
      }

      setForm(initialForm);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onProvisionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTenantId) return;

    try {
      setProvisioning(true);
      setError(null);
      setProvisionResult(null);

      const dryRun = !executeMode;
      const response = await fetch('/api/provision/tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: selectedTenantId, dryRun })
      });

      const data = (await response.json()) as ProvisionResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Failed to run provisioning (${response.status})`);

      setProvisionResult(data);
      await Promise.all([loadJobs(), loadPreflight()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run provisioning.');
    } finally {
      setProvisioning(false);
    }
  }

  const readinessTone = preflight?.ready ? 'text-emerald-700' : 'text-amber-700';

  return (
    <PageShell title="Jobs" subtitle="Track and trigger operational tasks.">
      <section className="panel p-5">
        <h2 className="text-base font-semibold text-ink">Execution readiness</h2>
        {preflight ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 space-y-2">
            <p className={readinessTone}>{preflight.ready ? 'Ready for execution' : 'Execution not ready'}</p>
            <p>Execution enabled: {preflight.executionEnabled ? 'Yes' : 'No (set PROVISION_EXECUTION_ENABLED=true)'}</p>
            {preflight.missingForExecution.length > 0 ? (
              <p>
                Missing required vars: <span className="font-mono">{preflight.missingForExecution.join(', ')}</span>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Loading readiness…</p>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold text-ink">Run Provisioning</h2>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={onProvisionSubmit}>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Tenant</span>
            <select
              value={selectedTenantId}
              onChange={(event) => setSelectedTenantId(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={executeMode}
              disabled={!preflight?.ready}
              onChange={(event) => setExecuteMode(event.target.checked)}
            />
            Request execution (dry-run disabled)
          </label>
          <button
            type="submit"
            disabled={provisioning || !selectedTenantId}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
          >
            {provisioning ? 'Submitting…' : executeMode ? 'Run Execution' : 'Run Dry-Run'}
          </button>
        </form>

        {provisionResult ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <p>
              Correlation ID: <span className="font-mono">{provisionResult.correlationId}</span>
            </p>
            <p>Job: {provisionResult.job.id}</p>
            <p className="mt-1">Commands:</p>
            <ul className="list-disc pl-5">
              {provisionResult.plan.commands.map((command) => (
                <li key={command} className="font-mono text-xs">
                  {command}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold text-ink">Quick create job</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Tenant"
            value={form.tenant}
            onChange={(event) => setForm((current) => ({ ...current, tenant: event.target.value }))}
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            placeholder="Task"
            value={form.task}
            onChange={(event) => setForm((current) => ({ ...current, task: event.target.value }))}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={form.status}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as JobStatus }))}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Job'}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="panel overflow-x-auto p-3">
        {loading ? (
          <p className="px-3 py-4 text-sm text-slate-600">Loading jobs…</p>
        ) : (
          <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {items.map((job) => (
                <tr key={job.id} className="bg-slate-50 text-slate-700">
                  <td className="px-3 py-2 font-mono">
                    <Link className="text-brand underline-offset-2 hover:underline" href={`/jobs/${job.id}`}>
                      {job.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{job.tenant}</td>
                  <td className="px-3 py-2">{job.task}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{job.status}</span>
                  </td>
                  <td className="px-3 py-2">{job.startedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </PageShell>
  );
}
