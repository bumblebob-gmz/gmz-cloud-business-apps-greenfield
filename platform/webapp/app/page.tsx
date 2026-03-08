import { PageShell } from '@/components/page-shell';
import { StatCard } from '@/components/stat-card';
import { jobs, tenants } from '@/lib/mock-data';

export default function DashboardPage() {
  const active = tenants.filter((t) => t.status === 'Active').length;

  return (
    <PageShell title="Dashboard" subtitle="Multi-tenant platform health and recent execution jobs.">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Tenants" value={String(tenants.length)} hint="Across all regions" />
        <StatCard label="Active Tenants" value={String(active)} hint="Running in production" />
        <StatCard label="Provisioning Queue" value="4" hint="2 require approval" />
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
                  <td className="px-3 py-2 font-mono">{job.id}</td>
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
