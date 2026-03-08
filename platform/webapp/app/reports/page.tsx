import { PageShell } from '@/components/page-shell';
import { reports } from '@/lib/mock-data';

export default function ReportsPage() {
  return (
    <PageShell title="Reports" subtitle="Generated platform and compliance reports.">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <article key={report.id} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">{report.id}</p>
            <h2 className="mt-2 text-lg font-semibold">{report.title}</h2>
            <p className="mt-3 text-sm text-slate-600">Owner: {report.owner}</p>
            <p className="text-sm text-slate-600">Period: {report.period}</p>
            <p className="mt-4 text-xs text-brand">Generated at {report.generatedAt}</p>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
