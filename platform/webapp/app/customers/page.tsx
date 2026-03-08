import { PageShell } from '@/components/page-shell';
import { tenants } from '@/lib/mock-data';

export default function CustomersPage() {
  return (
    <PageShell title="Customers / Tenants" subtitle="Overview of tenants, status, network, and deployment sizing.">
      <section className="panel overflow-x-auto p-3">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Region</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">VLAN</th>
              <th className="px-3 py-2">CIDR</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="bg-slate-50 text-slate-700">
                <td className="px-3 py-2 font-medium">{tenant.name}</td>
                <td className="px-3 py-2">{tenant.customer}</td>
                <td className="px-3 py-2">{tenant.region}</td>
                <td className="px-3 py-2">{tenant.size}</td>
                <td className="px-3 py-2">{tenant.vlan}</td>
                <td className="px-3 py-2 font-mono">{tenant.ipRange}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{tenant.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}
