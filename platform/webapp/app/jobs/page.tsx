'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import type { Job, JobStatus } from '@/lib/types';

const statuses: JobStatus[] = ['Queued', 'Running', 'Success', 'Failed'];

type CreateJobForm = {
  tenant: string;
  task: string;
  status: JobStatus;
};

const initialForm: CreateJobForm = {
  tenant: '',
  task: '',
  status: 'Queued'
};

export default function JobsPage() {
  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreateJobForm>(initialForm);

  async function loadJobs() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/jobs', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load jobs (${response.status})`);
      }

      const data = (await response.json()) as { items: Job[] };
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
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

  return (
    <PageShell title="Jobs" subtitle="Track and trigger operational tasks.">
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
