'use client';

import { FormEvent, useMemo, useState } from 'react';
import { PageShell } from '@/components/page-shell';
import { StepIndicator } from '@/components/step-indicator';

type SetupWizardForm = {
  preflight: {
    managementVmName: string;
    managementVmIp: string;
    targetNode: string;
    vlan: string;
    dnsResolver: string;
    ntpServer: string;
  };
  proxmox: {
    endpoint: string;
    username: string;
    tokenId: string;
    tokenSecret: string;
    vmStorage: string;
    networkBridge: string;
  };
  ionos: {
    datacenterId: string;
    region: string;
    contractId: string;
    apiPublicKey: string;
    apiPrivateKey: string;
  };
  bootstrap: {
    bootstrapUser: string;
    sshPort: string;
    installK3s: boolean;
    services: string[];
  };
  validation: {
    runConnectivityTests: boolean;
    runBackupSmokeTest: boolean;
    enforceTls: boolean;
    readinessTimeoutMinutes: string;
  };
};

type SetupPlanResponse = {
  generatedAt: string;
  environmentLabel: string;
  plan: {
    requiredChecks: string[];
    suggestedCommands: string[];
    maskedCredentialSummary: {
      proxmoxEndpoint: string;
      proxmoxUser: string;
      proxmoxTokenId: string;
      proxmoxTokenSecret: string;
      ionosPublicKey: string;
      ionosPrivateKey: string;
      contractId: string;
      datacenterId: string;
    };
  };
};

const steps = ['Preflight', 'Proxmox Credentials', 'IONOS Credentials', 'Services Bootstrap', 'Validation', 'Review & Plan'];
const bootstrapServices = ['Traefik', 'PostgreSQL', 'Redis', 'MinIO', 'Loki'];

export default function SetupWizardPage() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SetupPlanResponse | null>(null);
  const [form, setForm] = useState<SetupWizardForm>({
    preflight: {
      managementVmName: 'mgmt-vm-01',
      managementVmIp: '10.140.10.100',
      targetNode: 'pve-node-a',
      vlan: '140',
      dnsResolver: '1.1.1.1',
      ntpServer: 'pool.ntp.org'
    },
    proxmox: {
      endpoint: 'https://pve.company.lan:8006/api2/json',
      username: 'root@pam',
      tokenId: 'setup-wizard',
      tokenSecret: '',
      vmStorage: 'local-zfs',
      networkBridge: 'vmbr0'
    },
    ionos: {
      datacenterId: 'de-fra-dc-01',
      region: 'de/fra',
      contractId: 'contract-12345',
      apiPublicKey: '',
      apiPrivateKey: ''
    },
    bootstrap: {
      bootstrapUser: 'ops-admin',
      sshPort: '22',
      installK3s: true,
      services: ['Traefik', 'PostgreSQL']
    },
    validation: {
      runConnectivityTests: true,
      runBackupSmokeTest: true,
      enforceTls: true,
      readinessTimeoutMinutes: '20'
    }
  });

  const ipHint = useMemo(() => {
    const vlan = Number(form.preflight.vlan);
    if (!Number.isInteger(vlan) || vlan < 2 || vlan > 4094) {
      return 'VLAN must be 2-4094';
    }

    return `Expected static IP rule: 10.${vlan}.10.100`;
  }, [form.preflight.vlan]);

  const toggleService = (service: string) => {
    setForm((prev) => {
      const exists = prev.bootstrap.services.includes(service);
      return {
        ...prev,
        bootstrap: {
          ...prev.bootstrap,
          services: exists
            ? prev.bootstrap.services.filter((item) => item !== service)
            : [...prev.bootstrap.services, service]
        }
      };
    });
  };

  const buildPlan = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/setup/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Could not generate setup plan');
      }

      const payload = (await response.json()) as SetupPlanResponse;
      setPlan(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unknown setup error');
      setPlan(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Management VM Setup Wizard"
      subtitle="Create a dry-run setup plan for preflight checks, credential readiness, bootstrap actions, and validation."
    >
      <section className="panel space-y-6 p-5">
        <StepIndicator steps={steps} currentStep={step} />

        <form className="space-y-6" onSubmit={buildPlan}>
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label="Management VM Name"
                value={form.preflight.managementVmName}
                onChange={(value) => setForm((prev) => ({ ...prev, preflight: { ...prev.preflight, managementVmName: value } }))}
              />
              <Field
                label="Management VM IP"
                value={form.preflight.managementVmIp}
                onChange={(value) => setForm((prev) => ({ ...prev, preflight: { ...prev.preflight, managementVmIp: value } }))}
              />
              <Field
                label="Target Proxmox Node"
                value={form.preflight.targetNode}
                onChange={(value) => setForm((prev) => ({ ...prev, preflight: { ...prev.preflight, targetNode: value } }))}
              />
              <Field
                label="VLAN"
                value={form.preflight.vlan}
                onChange={(value) => setForm((prev) => ({ ...prev, preflight: { ...prev.preflight, vlan: value } }))}
              />
              <Field
                label="DNS Resolver"
                value={form.preflight.dnsResolver}
                onChange={(value) => setForm((prev) => ({ ...prev, preflight: { ...prev.preflight, dnsResolver: value } }))}
              />
              <Field
                label="NTP Server"
                value={form.preflight.ntpServer}
                onChange={(value) => setForm((prev) => ({ ...prev, preflight: { ...prev.preflight, ntpServer: value } }))}
              />
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 md:col-span-3">{ipHint}</div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Proxmox API Endpoint"
                value={form.proxmox.endpoint}
                onChange={(value) => setForm((prev) => ({ ...prev, proxmox: { ...prev.proxmox, endpoint: value } }))}
              />
              <Field
                label="Proxmox User"
                value={form.proxmox.username}
                onChange={(value) => setForm((prev) => ({ ...prev, proxmox: { ...prev.proxmox, username: value } }))}
              />
              <Field
                label="Token ID"
                value={form.proxmox.tokenId}
                onChange={(value) => setForm((prev) => ({ ...prev, proxmox: { ...prev.proxmox, tokenId: value } }))}
              />
              <Field
                label="Token Secret"
                value={form.proxmox.tokenSecret}
                type="password"
                onChange={(value) => setForm((prev) => ({ ...prev, proxmox: { ...prev.proxmox, tokenSecret: value } }))}
              />
              <Field
                label="VM Storage"
                value={form.proxmox.vmStorage}
                onChange={(value) => setForm((prev) => ({ ...prev, proxmox: { ...prev.proxmox, vmStorage: value } }))}
              />
              <Field
                label="Network Bridge"
                value={form.proxmox.networkBridge}
                onChange={(value) => setForm((prev) => ({ ...prev, proxmox: { ...prev.proxmox, networkBridge: value } }))}
              />
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="IONOS Datacenter ID"
                value={form.ionos.datacenterId}
                onChange={(value) => setForm((prev) => ({ ...prev, ionos: { ...prev.ionos, datacenterId: value } }))}
              />
              <Field
                label="Region"
                value={form.ionos.region}
                onChange={(value) => setForm((prev) => ({ ...prev, ionos: { ...prev.ionos, region: value } }))}
              />
              <Field
                label="Contract ID"
                value={form.ionos.contractId}
                onChange={(value) => setForm((prev) => ({ ...prev, ionos: { ...prev.ionos, contractId: value } }))}
              />
              <Field
                label="API Public Key"
                value={form.ionos.apiPublicKey}
                type="password"
                onChange={(value) => setForm((prev) => ({ ...prev, ionos: { ...prev.ionos, apiPublicKey: value } }))}
              />
              <Field
                label="API Private Key"
                value={form.ionos.apiPrivateKey}
                type="password"
                onChange={(value) => setForm((prev) => ({ ...prev, ionos: { ...prev.ionos, apiPrivateKey: value } }))}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Bootstrap SSH User"
                  value={form.bootstrap.bootstrapUser}
                  onChange={(value) => setForm((prev) => ({ ...prev, bootstrap: { ...prev.bootstrap, bootstrapUser: value } }))}
                />
                <Field
                  label="SSH Port"
                  value={form.bootstrap.sshPort}
                  onChange={(value) => setForm((prev) => ({ ...prev, bootstrap: { ...prev.bootstrap, sshPort: value } }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.bootstrap.installK3s}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bootstrap: { ...prev.bootstrap, installK3s: e.target.checked } }))
                  }
                />
                Install K3s baseline
              </label>

              <div>
                <p className="mb-2 text-sm text-slate-600">Bootstrap services</p>
                <div className="flex flex-wrap gap-2">
                  {bootstrapServices.map((service) => {
                    const selected = form.bootstrap.services.includes(service);
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => toggleService(service)}
                        className={`rounded-lg border px-4 py-2 text-sm ${
                          selected ? 'border-brand bg-brand text-white' : 'border-slate-300'
                        }`}
                      >
                        {service}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4 md:grid-cols-2">
              <CheckboxField
                label="Connectivity tests (DNS, gateway, Proxmox API, IONOS API)"
                checked={form.validation.runConnectivityTests}
                onChange={(checked) => setForm((prev) => ({ ...prev, validation: { ...prev.validation, runConnectivityTests: checked } }))}
              />
              <CheckboxField
                label="Backup smoke test"
                checked={form.validation.runBackupSmokeTest}
                onChange={(checked) => setForm((prev) => ({ ...prev, validation: { ...prev.validation, runBackupSmokeTest: checked } }))}
              />
              <CheckboxField
                label="Enforce TLS and cert checks"
                checked={form.validation.enforceTls}
                onChange={(checked) => setForm((prev) => ({ ...prev, validation: { ...prev.validation, enforceTls: checked } }))}
              />
              <Field
                label="Readiness timeout (minutes)"
                value={form.validation.readinessTimeoutMinutes}
                onChange={(value) => setForm((prev) => ({ ...prev, validation: { ...prev.validation, readinessTimeoutMinutes: value } }))}
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
              <p>
                <strong>VM:</strong> {form.preflight.managementVmName} @ {form.preflight.managementVmIp} on {form.preflight.targetNode}
              </p>
              <p>
                <strong>Network:</strong> VLAN {form.preflight.vlan}, DNS {form.preflight.dnsResolver}, NTP {form.preflight.ntpServer}
              </p>
              <p>
                <strong>Proxmox:</strong> {form.proxmox.endpoint} ({form.proxmox.username}) / storage {form.proxmox.vmStorage}
              </p>
              <p>
                <strong>IONOS:</strong> DC {form.ionos.datacenterId}, region {form.ionos.region}, contract {form.ionos.contractId}
              </p>
              <p>
                <strong>Bootstrap:</strong> {form.bootstrap.bootstrapUser}:{form.bootstrap.sshPort}, services {form.bootstrap.services.join(', ') || 'none'}
              </p>
              <p>
                <strong>Validation:</strong>{' '}
                {[form.validation.runConnectivityTests && 'connectivity', form.validation.runBackupSmokeTest && 'backup', form.validation.enforceTls && 'tls']
                  .filter(Boolean)
                  .join(', ') || 'none'}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={step === 0 || submitting}
              onClick={() => setStep((current) => Math.max(current - 1, 0))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Back
            </button>
            <div className="flex gap-2">
              {step < steps.length - 1 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setStep((current) => Math.min(current + 1, steps.length - 1))}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Next
                </button>
              )}
              {step === steps.length - 1 && (
                <button type="submit" disabled={submitting} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {submitting ? 'Generating Plan…' : 'Generate Setup Plan'}
                </button>
              )}
            </div>
          </div>

          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        </form>

        {plan && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <header>
              <h2 className="text-lg font-semibold text-ink">Generated Setup Plan</h2>
              <p className="text-xs text-slate-500">
                Dry-run only · generated at {new Date(plan.generatedAt).toLocaleString()} · environment {plan.environmentLabel}
              </p>
            </header>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Required checks</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {plan.plan.requiredChecks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Suggested commands</h3>
                <ul className="space-y-2 text-xs">
                  {plan.plan.suggestedCommands.map((command) => (
                    <li key={command} className="rounded-md bg-slate-900 px-3 py-2 font-mono text-slate-100">
                      {command}
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Masked credential summary</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(plan.plan.maskedCredentialSummary).map(([key, value]) => (
                  <div key={key} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="mr-2 font-semibold text-slate-900">{key}:</span>
                    <span className="font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}
      </section>
    </PageShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
