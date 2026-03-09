'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import type { Report } from '@/lib/types';
import type { ReportOptions, ReportFormat, ReportType } from '@/lib/reporting/report-types';

export default function ReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('summary');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [tenantId, setTenantId] = useState<string>('');

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

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (generating) return;

    try {
      setGenerating(true);
      const options: ReportOptions = {
        reportType,
        format,
        ...(reportType === 'tenant' ? { tenantId } : {})
      };

      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      // Trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'report.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error generating report');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PageShell title="Reports" subtitle="Generated platform and compliance reports.">
      
      <section className="panel p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Generate New Report</h2>
        <form onSubmit={handleGenerate} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select 
              value={reportType} 
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="summary">Platform Summary</option>
              <option value="tenant">Tenant Report</option>
            </select>
          </div>

          {reportType === 'tenant' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tenant ID</label>
              <input 
                type="text" 
                required 
                value={tenantId} 
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="e.g. acme-corp"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Format</label>
            <select 
              value={format} 
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="pdf">PDF</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={generating}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate & Download'}
          </button>
        </form>
      </section>

      <section className="flex items-center justify-end mb-4">
        <a
          href="/api/reports.csv"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
        >
          Export CSV (Legacy)
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
