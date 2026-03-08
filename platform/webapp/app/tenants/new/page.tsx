'use client';

import { FormEvent, useMemo, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import type { AuthMode, Tenant } from '@/lib/types';

type FormState = {
  customerName: string;
  tenantName: string;
  contactEmail: string;
  region: string;
  size: 'S' | 'M' | 'L' | 'XL';
  vlan: string;
  authMode: AuthMode;
  entraTenantId: string;
  ldapUrl: string;
  localAdminEmail: string;
  apps: string[];
  maintenanceWindow: string;
};

type TenantCreateResponse = {
  item: Tenant;
  job: {
    id: string;
  };
};

const requiredApp = 'authentik';
const appCatalogOptions = [
  requiredApp,
  'nextcloud',
  'it-tools',
  'paperless-ngx',
  'vaultwarden',
  'bookstack',
  'joplin',
  'libretranslate',
  'ollama',
  'openwebui',
  'searxng',
  'snipe-it',
  'wiki-js'
];

const steps = ['Customer Basics', 'Sizing', 'Network', 'Authentication', 'Apps', 'Maintenance', 'Review'];

export default function NewTenantPage() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    customerName: '',
    tenantName: '',
    contactEmail: '',
    region: 'eu-central-1',
    size: 'M',
    vlan: '140',
    authMode: 'EntraID',
    entraTenantId: '',
    ldapUrl: '',
    localAdminEmail: '',
    apps: [requiredApp],
    maintenanceWindow: 'Sundays 02:00-04:00 CET'
  });

  const ipPreview = useMemo(() => {
    const vlan = Number(form.vlan);
    if (!Number.isInteger(vlan) || vlan < 2 || vlan > 4094) {
      return 'Invalid VLAN (2-4094 required)';
    }
    return `VLAN ${vlan} → 10.${vlan}.10.100`;
  }, [form.vlan]);

  const toggleApp = (app: string) => {
    if (app === requiredApp) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      apps: prev.apps.includes(app) ? prev.apps.filter((a) => a !== app) : [...prev.apps, app]
    }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: form.tenantName,
          customer: form.customerName,
          contactEmail: form.contactEmail,
          region: form.region,
          size: form.size,
          vlan: Number(form.vlan),
          authMode: form.authMode,
          authConfig: {
            entraTenantId: form.entraTenantId,
            ldapUrl: form.ldapUrl,
            localAdminEmail: form.localAdminEmail
          },
          apps: Array.from(new Set([requiredApp, ...form.apps])),
          maintenanceWindow: form.maintenanceWindow
        })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? 'Could not create tenant');
      }

      const payload = (await response.json()) as TenantCreateResponse;
      setSuccessMessage(`Tenant ${payload.item.name} created. Provisioning job ${payload.job.id} queued.`);
      setStep(0);
      setForm((prev) => ({
        ...prev,
        customerName: '',
        tenantName: '',
        contactEmail: '',
        entraTenantId: '',
        ldapUrl: '',
        localAdminEmail: '',
        apps: [requiredApp]
      }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
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
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Customer Name" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />
              <Field label="Tenant Name" value={form.tenantName} onChange={(value) => setForm({ ...form, tenantName: value })} />
              <Field label="Contact Email" value={form.contactEmail} onChange={(value) => setForm({ ...form, contactEmail: value })} />
              <Field label="Region" value={form.region} onChange={(value) => setForm({ ...form, region: value })} />
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
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                VM Static IP (fixed rule): <span className="font-mono">10.&lt;VLAN-ID&gt;.10.100</span>
              </div>
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
                  onChange={(e) => setForm({ ...form, authMode: e.target.value as AuthMode })}
                >
                  <option value="EntraID">EntraID</option>
                  <option value="LDAP">LDAP</option>
                  <option value="Local User">Local User</option>
                </select>
              </div>

              {form.authMode === 'EntraID' && (
                <Field label="EntraID Tenant ID" value={form.entraTenantId} onChange={(value) => setForm({ ...form, entraTenantId: value })} />
              )}
              {form.authMode === 'LDAP' && <Field label="LDAP URL" value={form.ldapUrl} onChange={(value) => setForm({ ...form, ldapUrl: value })} />}
              {form.authMode === 'Local User' && (
                <Field label="Local Admin Email" value={form.localAdminEmail} onChange={(value) => setForm({ ...form, localAdminEmail: value })} />
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <p className="mb-2 text-sm text-slate-600">Application catalog IDs</p>
              <div className="flex flex-wrap gap-2">
                {appCatalogOptions.map((app) => (
                  <button
                    key={app}
                    type="button"
                    disabled={app === requiredApp}
                    onClick={() => toggleApp(app)}
                    className={`rounded-lg border px-4 py-2 text-sm ${form.apps.includes(app) ? 'border-brand bg-brand text-white' : 'border-slate-300'} ${app === requiredApp ? 'cursor-not-allowed opacity-90' : ''}`}
                  >
                    {app}
                    {app === requiredApp ? ' (required)' : ''}
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
              <p><strong>Auth:</strong> {form.authMode}</p>
              {form.authMode === 'EntraID' && <p><strong>EntraID Tenant ID:</strong> {form.entraTenantId || '—'}</p>}
              {form.authMode === 'LDAP' && <p><strong>LDAP URL:</strong> {form.ldapUrl || '—'}</p>}
              {form.authMode === 'Local User' && <p><strong>Local Admin Email:</strong> {form.localAdminEmail || '—'}</p>}
              <p><strong>Apps:</strong> {Array.from(new Set([requiredApp, ...form.apps])).join(', ')}</p>
              <p><strong>Maintenance:</strong> {form.maintenanceWindow}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button type="button" disabled={step === 0 || submitting} onClick={() => setStep((s) => Math.max(0, s - 1))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Back</button>
            <div className="flex gap-2">
              {step < steps.length - 1 && (
                <button type="button" disabled={submitting} onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Next</button>
              )}
              {step === steps.length - 1 && (
                <button type="submit" disabled={submitting} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {submitting ? 'Creating…' : 'Create Tenant'}
                </button>
              )}
            </div>
          </div>

          {successMessage && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</p>}
          {errorMessage && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</p>}
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
