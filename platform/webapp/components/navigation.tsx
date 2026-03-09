'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DevRoleSwitch } from '@/components/dev-role-switch';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/tenants/new', label: 'New Tenant' },
  { href: '/setup', label: 'Setup Wizard' },
  { href: '/deployments', label: 'Deployments' },
  { href: '/reports', label: 'Reports' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/admin/security', label: 'Admin Security' }
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <aside className="panel h-fit p-4 lg:sticky lg:top-4">
      <p className="mb-4 text-sm font-semibold text-slate-500">GMZ Cloud Control</p>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-brand text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <DevRoleSwitch />
    </aside>
  );
}
