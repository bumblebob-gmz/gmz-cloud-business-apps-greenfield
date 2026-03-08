'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import type { Deployment } from '@/lib/types';

export default function DeploymentsPage() {
  const [items, setItems] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDeployments() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/deployments', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load deployments (${response.status})`);
        }

        const data = (await response.json()) as { items: Deployment[] };
        if (!cancelled) {
          setItems(data.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load deployments.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDeployments();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell title="Deployments" subtitle="Release status and environment health across tenants.">
      <section className="panel overflow-x-auto p-3">
        {loading ? (
          <p className="px-3 py-4 text-sm text-slate-600">Loading deployments…</p>
        ) : error ? (
          <p className="px-3 py-4 text-sm text-red-600">{error}</p>
        ) : (
          <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-3 py-2">Deployment</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Environment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((dep) => (
                <tr key={dep.id} className="bg-slate-50 text-slate-700">
                  <td className="px-3 py-2 font-mono">{dep.id}</td>
                  <td className="px-3 py-2">{dep.tenant}</td>
                  <td className="px-3 py-2">{dep.version}</td>
                  <td className="px-3 py-2">{dep.env}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{dep.status}</span>
                  </td>
                  <td className="px-3 py-2">{dep.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </PageShell>
  );
}
