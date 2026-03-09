import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getJobById, getTenantByName } from '@/lib/data-store';

type JobDetailPageProps = {
  params: {
    id: string;
  };
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const job = await getJobById(params.id);

  if (!job) {
    notFound();
  }

  const tenant = await getTenantByName(job.tenant);

  return (
    <PageShell title={`Job ${job.id}`} subtitle="Execution detail from local JSON store.">
      <section className="panel p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Job Summary</h2>
        <dl className="grid gap-3 md:grid-cols-2 text-sm">
          <Info label="Job ID" value={job.id} mono />
          <Info label="Status" value={job.status} />
          <Info label="Task" value={job.task} />
          <Info label="Started" value={job.startedAt} />
          <Info label="Tenant" value={job.tenant} />
          <Info label="Updated" value={job.updatedAt ?? '-'} />
        </dl>
      </section>

      <section className="panel p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Tenant Context</h2>
        {tenant ? (
          <dl className="grid gap-3 md:grid-cols-2 text-sm">
            <Info label="Tenant ID" value={tenant.id} mono />
            <Info label="Customer" value={tenant.customer} />
            <Info label="Region" value={tenant.region} />
            <Info label="Size" value={tenant.size} />
            <Info label="VLAN" value={String(tenant.vlan)} />
            <Info label="IP Address" value={tenant.ipAddress} mono />
          </dl>
        ) : (
          <p className="text-sm text-slate-600">No tenant context found in local store for this job.</p>
        )}
      </section>

      {job.details?.commandAttempts?.length ? (
        <section className="panel p-5 space-y-3 overflow-x-auto">
          <h2 className="text-base font-semibold text-ink">Command attempt timeline</h2>
          <p className="text-xs text-slate-600">
            Retries configured: <span className="font-mono">{job.details.retriesConfigured ?? 0}</span>
          </p>
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Step</th>
                <th className="px-3 py-2">Attempt</th>
                <th className="px-3 py-2">Exit</th>
                <th className="px-3 py-2">Backoff</th>
                <th className="px-3 py-2">Snippet</th>
              </tr>
            </thead>
            <tbody>
              {job.details.commandAttempts.map((attempt, index) => (
                <tr key={`${attempt.command}-${attempt.at}-${index}`} className="bg-slate-50 text-slate-700 align-top">
                  <td className="px-3 py-2 font-mono text-xs">{attempt.at}</td>
                  <td className="px-3 py-2">{attempt.step}</td>
                  <td className="px-3 py-2 font-mono">
                    {attempt.attempt}/{attempt.maxAttempts}
                  </td>
                  <td className="px-3 py-2">{attempt.exitCode}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {attempt.backoffMs ? `${Math.round(attempt.backoffMs / 1000)}s` : '-'}
                  </td>
                  <td className="px-3 py-2">{attempt.snippet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {job.details?.rollback ? (
        <section className="panel p-5 space-y-3">
          <h2 className="text-base font-semibold text-ink">Rollback outcome</h2>
          <dl className="grid gap-3 md:grid-cols-2 text-sm">
            <Info label="Attempted" value={job.details.rollback.attempted ? 'Yes' : 'No'} />
            <Info label="Status" value={job.details.rollback.ok === undefined ? '-' : job.details.rollback.ok ? 'Success' : 'Failed'} />
            <Info label="When" value={job.details.rollback.at ?? '-'} mono />
            <Info label="Command" value={job.details.rollback.command ?? '-'} mono />
            <Info label="Exit Code" value={job.details.rollback.exitCode?.toString() ?? '-'} />
          </dl>
          {job.details.rollback.snippet ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{job.details.rollback.snippet}</p>
          ) : null}
          {job.details.rollback.reason ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{job.details.rollback.reason}</p>
          ) : null}
        </section>
      ) : null}

      <Link href="/jobs" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm">
        Back to Jobs
      </Link>
    </PageShell>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</dd>
    </div>
  );
}
