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
      <dd className={`mt-1 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
