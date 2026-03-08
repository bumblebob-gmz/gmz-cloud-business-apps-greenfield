'use client';

import { Navigation } from '@/components/navigation';
import { ReactNode } from 'react';

export function PageShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[240px_1fr]">
      <Navigation />
      <section className="space-y-4">
        <header className="panel p-6">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
