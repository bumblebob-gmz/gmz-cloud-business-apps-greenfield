'use client';

import { FormEvent, useMemo, useState } from 'react';
import { PageShell } from '@/components/page-shell';

type FormState = {
  customerName: string;
  tenantName: string;
  contactEmail: string;
  size: 'S' | 'M' | 'L' | 'XL';
  vlan: string;
  baseIp: string;
  authMode: 'SAML' | 'OIDC' | 'LDAP';
  connectorHost: string;
  connectorToken: string;
  apps: string[];
  maintenanceWindow: string;
};

const appOptions = ['CRM', 'Billing', 'Document Hub', 'Analytics'];
const steps = ['Customer Basics', 'Sizing', 'Network', 'Authentication', 'Apps', 'Maintenance', 'Review'];

export default function NewTenantPage() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>({
    customerName: '',
    tenantName: '',
    contactEmail: '',
    size: 'M',
    vlan: '140',
    baseIp: '10.14.0.0/24',
    authMode: 'OIDC',
    connectorHost: '',
    connectorToken: '',
    apps: ['CRM'],
    maintenanceWindow: 'Sundays 02:00-04:00 CET'
  });

  const ipPreview = useMemo(() => `VLAN ${form.vlan} → ${form.baseIp}`, [form.vlan, form.baseIp]);

  const toggleApp = (app: string) => {
    setForm((prev) => ({
      ...prev,
      apps: prev.apps.includes(app) ? prev.apps.filter((a) => a !== app) : [...prev.apps, app]
    }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <PageShell title="Tenant Creation Wizard" subtitle="Step-by-step onboarding flow for provisioning a new tenant.">
      <section className="panel p-5">
        <ol className="mb-6 grid gap-2 md:grid-cols-7">
          {steps.map((name, idx) => (
            <li key={name} className={`rounded-lg px-3 py-2 text-xs ${idx === step ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}>
              {idx + 1}. {name}
            </li>
          ))}
        </ol>

        <form className="space-y-6" onSubmit={submit}>
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Customer Name" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />
              <Field label="Tenant Name" value={form.tenantName} onChange={(value) => setForm({ ...form, tenantName: value })} />
              <Field label="Contact Email" value={form.contactEmail} onChange={(value) => setForm({ ...form, contactEmail: value })} />
            </div>
          )}

          {step === 1 && (
            <div>
              <p className="mb-2 text-sm text-slate-600">Sizing shirt size</p>
              <div className="flex flex-wrap gap-2">
                {(['S', 'M', 'L', 'XL'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setForm({ ...form, size })}
                    className={`rounded-lg border px-4 py-2 text-sm ${form.size === size ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="VLAN" value={form.vlan} onChange={(value) => setForm({ ...form, vlan: value })} />
              <Field label="IP Range" value={form.baseIp} onChange={(value) => setForm({ ...form, baseIp: value })} />
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 md:col-span-2">Preview: {ipPreview}</div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Auth Mode</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.authMode}
                  onChange={(e) => setForm({ ...form, authMode: e.target.value as FormState['authMode'] })}
                >
                  <option>SAML</option>
                  <option>OIDC</option>
                  <option>LDAP</option>
                </select>
              </div>
              <Field label="Connector Host" value={form.connectorHost} onChange={(value) => setForm({ ...form, connectorHost: value })} />
              <Field label="Connector Token" value={form.connectorToken} onChange={(value) => setForm({ ...form, connectorToken: value })} />
            </div>
          )}

          {step === 4 && (
            <div>
              <p className="mb-2 text-sm text-slate-600">Application selection</p>
              <div className="flex flex-wrap gap-2">
                {appOptions.map((app) => (
                  <button
                    key={app}
                    type="button"
                    onClick={() => toggleApp(app)}
                    className={`rounded-lg border px-4 py-2 text-sm ${form.apps.includes(app) ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}
                  >
                    {app}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 5 && <Field label="Maintenance Window" value={form.maintenanceWindow} onChange={(value) => setForm({ ...form, maintenanceWindow: value })} />}

          {step === 6 && (
            <div className="rounded-xl bg-slate-100 p-4 text-sm leading-6 text-slate-700">
              <p><strong>Customer:</strong> {form.customerName || '—'} / {form.tenantName || '—'}</p>
              <p><strong>Contact:</strong> {form.contactEmail || '—'}</p>
              <p><strong>Sizing:</strong> {form.size}</p>
              <p><strong>Network:</strong> {ipPreview}</p>
              <p><strong>Auth:</strong> {form.authMode} ({form.connectorHost || 'no connector host'})</p>
              <p><strong>Apps:</strong> {form.apps.join(', ') || '—'}</p>
              <p><strong>Maintenance:</strong> {form.maintenanceWindow}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Back</button>
            <div className="flex gap-2">
              {step < steps.length - 1 && (
                <button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Next</button>
              )}
              {step === steps.length - 1 && (
                <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Create Tenant</button>
              )}
            </div>
          </div>

          {submitted && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Tenant creation request submitted (mock).</p>}
        </form>
      </section>
    </PageShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
    </label>
  );
}
