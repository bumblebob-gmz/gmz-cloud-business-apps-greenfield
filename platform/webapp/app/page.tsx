'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { StatCard } from '@/components/stat-card';
import type { Job, Tenant } from '@/lib/types';

export default function DashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [tenantsRes, jobsRes] = await Promise.all([
          fetch('/api/tenants', { cache: 'no-store' }),
          fetch('/api/jobs', { cache: 'no-store' })
        ]);

        if (!tenantsRes.ok || !jobsRes.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const tenantsData = (await tenantsRes.json()) as { items: Tenant[] };
        const jobsData = (await jobsRes.json()) as { items: Job[] };

        setTenants(tenantsData.items);
        setJobs(jobsData.items);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const active = useMemo(() => tenants.filter((t) => t.status === 'Active').length, [tenants]);
  const provisioning = useMemo(() => tenants.filter((t) => t.status === 'Provisioning').length, [tenants]);

  return (
    <PageShell title="Dashboard" subtitle="Multi-tenant platform health and recent execution jobs.">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Tenants" value={loading ? '—' : String(tenants.length)} hint="Across all regions" />
        <StatCard label="Active Tenants" value={loading ? '—' : String(active)} hint="Running in production" />
        <StatCard label="Provisioning Queue" value={loading ? '—' : String(provisioning)} hint="Pending setup jobs" />
      </div>

      <section className="panel overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Recent Jobs</h2>
        </header>
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="rounded-xl bg-slate-50 text-slate-700">
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
        </div>
      </section>
    </PageShell>
  );
}
