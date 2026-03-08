import { PageShell } from '@/components/page-shell';
import { deployments } from '@/lib/mock-data';

export default function DeploymentsPage() {
  return (
    <PageShell title="Deployments" subtitle="Release status and environment health across tenants.">
      <section className="panel overflow-x-auto p-3">
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
            {deployments.map((dep) => (
              <tr key={dep.id} className="bg-slate-50 text-slate-700">
                <td className="px-3 py-2 font-mono">{dep.id}</td>
                <td className="px-3 py-2">{dep.tenant}</td>
                <td className="px-3 py-2">{dep.version}</td>
                <td className="px-3 py-2">{dep.env}</td>
                <td className="px-3 py-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{dep.status}</span></td>
                <td className="px-3 py-2">{dep.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
