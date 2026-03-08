'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import type { Report } from '@/lib/types';

export default function ReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/reports', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load reports (${response.status})`);
        }

        const data = (await response.json()) as { items: Report[] };
        if (!cancelled) {
          setItems(data.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reports.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell title="Reports" subtitle="Generated platform and compliance reports.">
      <section className="flex items-center justify-end">
        <a
          href="/api/reports.csv"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
        >
          Export CSV
        </a>
      </section>

      {loading ? (
        <section className="panel p-5">
          <p className="text-sm text-slate-600">Loading reports…</p>
        </section>
      ) : error ? (
        <section className="panel p-5">
          <p className="text-sm text-red-600">{error}</p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((report) => (
            <article key={report.id} className="panel p-5">
              <p className="text-xs uppercase tracking-wide text-slate-500">{report.id}</p>
              <h2 className="mt-2 text-lg font-semibold">{report.title}</h2>
              <p className="mt-3 text-sm text-slate-600">Owner: {report.owner}</p>
              <p className="text-sm text-slate-600">Period: {report.period}</p>
              <p className="mt-4 text-xs text-brand">Generated at {report.generatedAt}</p>
            </article>
          ))}
        </section>
      )}
    </PageShell>
  );
}
