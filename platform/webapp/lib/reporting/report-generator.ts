import PDFDocument from 'pdfkit';
import type { ReportOptions } from '@/lib/reporting/report-types';
import type { Tenant, Job } from '@/lib/types';
import type { AuditEvent } from '@/lib/audit';

// ─── CSV helpers ───────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function buildCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(','))
    .join('\n');
}

// ─── CSV exports ───────────────────────────────────────────────────────────

export function tenantListToCsv(tenants: Tenant[]): string {
  const header = ['id', 'name', 'customer', 'region', 'status', 'size', 'vlan', 'ipAddress', 'authMode', 'apps', 'contactEmail', 'maintenanceWindow'];
  const rows = tenants.map((t) => [
    t.id,
    t.name,
    t.customer,
    t.region,
    t.status,
    t.size,
    t.vlan,
    t.ipAddress,
    t.authMode ?? '',
    (t.apps ?? []).join(';'),
    t.contactEmail ?? '',
    t.maintenanceWindow ?? ''
  ]);
  return buildCsv(header, rows);
}

export function provisioningHistoryToCsv(jobs: Job[]): string {
  const header = ['id', 'tenant', 'task', 'status', 'startedAt', 'updatedAt', 'correlationId', 'error'];
  const rows = jobs.map((j) => [
    j.id,
    j.tenant,
    j.task,
    j.status,
    j.startedAt,
    j.updatedAt ?? '',
    j.correlationId ?? '',
    j.details?.error ?? ''
  ]);
  return buildCsv(header, rows);
}

// ─── PDF helpers ────────────────────────────────────────────────────────────

const BRAND_DARK = '#1F2B57';
const BRAND_ACCENT = '#E16242';

function pdfHeader(doc: InstanceType<typeof PDFDocument>, title: string, subtitle: string) {
  // Header bar
  doc.rect(0, 0, doc.page.width, 50).fill(BRAND_DARK);

  doc.fillColor('#ffffff')
     .fontSize(18)
     .font('Helvetica-Bold')
     .text('GMZ Cloud Business Apps', 50, 14);

  doc.moveDown(1.2);

  doc.fillColor(BRAND_ACCENT)
     .fontSize(16)
     .font('Helvetica-Bold')
     .text(title, { align: 'center' });

  if (subtitle) {
    doc.fillColor('#475569')
       .fontSize(10)
       .font('Helvetica')
       .text(subtitle, { align: 'center' });
  }

  doc.moveDown(0.6);
  doc.fillColor('#e2e8f0')
     .rect(50, doc.y, doc.page.width - 100, 1)
     .fill();
  doc.moveDown(0.8);
}

function pdfMeta(doc: InstanceType<typeof PDFDocument>, options: ReportOptions) {
  doc.fillColor('#64748b')
     .fontSize(9)
     .font('Helvetica')
     .text(`Generated: ${new Date().toISOString()}   |   Type: ${options.reportType}   |   Format: ${options.format}`);
  doc.moveDown(1);
}

function pdfSectionTitle(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.fillColor(BRAND_DARK)
     .fontSize(12)
     .font('Helvetica-Bold')
     .text(text);
  doc.moveDown(0.4);
}

function pdfTable(
  doc: InstanceType<typeof PDFDocument>,
  headers: string[],
  rows: string[][]
) {
  const colWidth = Math.floor((doc.page.width - 100) / headers.length);
  const startX = 50;
  let y = doc.y;

  // Header row
  doc.fillColor(BRAND_DARK).rect(startX, y, doc.page.width - 100, 16).fill();
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  headers.forEach((h, i) => {
    doc.text(h, startX + i * colWidth + 4, y + 4, { width: colWidth - 8, lineBreak: false });
  });
  y += 16;

  // Data rows
  rows.forEach((row, ri) => {
    // Page break guard
    if (y + 16 > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }

    const bg = ri % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.fillColor(bg).rect(startX, y, doc.page.width - 100, 14).fill();
    doc.fillColor('#1e293b').fontSize(7).font('Helvetica');
    row.forEach((cell, i) => {
      const cellText = String(cell ?? '').slice(0, 40);
      doc.text(cellText, startX + i * colWidth + 4, y + 3, { width: colWidth - 8, lineBreak: false });
    });
    y += 14;
  });

  doc.moveDown(1);
  // Reset y position after table
  doc.y = y + 10;
}

// ─── PDF report generators ─────────────────────────────────────────────────

export async function generateTenantReport(tenantId: string, options: ReportOptions, tenants?: Tenant[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    pdfHeader(doc, `Tenant Report: ${tenantId}`, 'Per-Tenant Summary');
    pdfMeta(doc, options);

    if (tenants) {
      const tenant = tenants.find((t) => t.id === tenantId || t.name === tenantId);
      if (tenant) {
        pdfSectionTitle(doc, 'Tenant Details');
        const details: [string, string][] = [
          ['ID', tenant.id],
          ['Name', tenant.name],
          ['Customer', tenant.customer],
          ['Region', tenant.region],
          ['Status', tenant.status],
          ['Size', tenant.size],
          ['VLAN', String(tenant.vlan)],
          ['IP Address', tenant.ipAddress],
          ['Auth Mode', tenant.authMode ?? 'N/A'],
          ['Contact', tenant.contactEmail ?? 'N/A'],
          ['Maintenance Window', tenant.maintenanceWindow ?? 'N/A'],
          ['Apps', (tenant.apps ?? []).join(', ') || 'N/A']
        ];
        pdfTable(doc, ['Field', 'Value'], details);
      } else {
        doc.fillColor('#ef4444').fontSize(11).text(`Tenant "${tenantId}" not found.`);
      }
    } else {
      pdfSectionTitle(doc, 'Tenant Details');
      doc.fillColor('#475569').fontSize(10).font('Helvetica')
         .text(`Tenant ID: ${tenantId}`);
    }

    doc.end();
  });
}

export async function generateSummaryReport(options: ReportOptions, tenants?: Tenant[], jobs?: Job[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    pdfHeader(doc, 'Platform Summary Report', `Generated ${new Date().toLocaleDateString('de-DE')}`);
    pdfMeta(doc, options);

    // Tenant overview table
    if (tenants && tenants.length > 0) {
      pdfSectionTitle(doc, 'Tenants');
      pdfTable(doc,
        ['ID', 'Name', 'Customer', 'Region', 'Status', 'Size'],
        tenants.map((t) => [t.id, t.name, t.customer, t.region, t.status, t.size])
      );
    }

    // Provisioning overview
    if (jobs && jobs.length > 0) {
      pdfSectionTitle(doc, 'Recent Jobs');
      pdfTable(doc,
        ['ID', 'Tenant', 'Task', 'Status', 'Started'],
        jobs.slice(0, 20).map((j) => [j.id, j.tenant, j.task, j.status, j.startedAt])
      );
    }

    doc.end();
  });
}

export async function generateTenantListPdf(tenants: Tenant[], options: ReportOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    pdfHeader(doc, 'Tenant List', `Total: ${tenants.length} tenants`);
    pdfMeta(doc, options);

    pdfSectionTitle(doc, 'All Tenants');
    pdfTable(doc,
      ['ID', 'Name', 'Customer', 'Region', 'Status', 'Size', 'VLAN', 'Auth'],
      tenants.map((t) => [t.id, t.name, t.customer, t.region, t.status, t.size, String(t.vlan), t.authMode ?? ''])
    );

    doc.end();
  });
}

export async function generateAuditEventsPdf(events: AuditEvent[], options: ReportOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    pdfHeader(doc, 'Audit Events Report', `${events.length} events`);
    pdfMeta(doc, options);

    pdfSectionTitle(doc, 'Audit Events');
    pdfTable(doc,
      ['Timestamp', 'Actor', 'Tenant', 'Action', 'Resource', 'Outcome'],
      events.map((e) => [
        e.timestamp.replace('T', ' ').slice(0, 19),
        `${e.actor.id} (${e.actor.type})`,
        e.tenantId,
        e.action,
        e.resource,
        e.outcome
      ])
    );

    doc.end();
  });
}

export async function generateProvisioningHistoryPdf(jobs: Job[], options: ReportOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    pdfHeader(doc, 'Provisioning History', `${jobs.length} jobs`);
    pdfMeta(doc, options);

    pdfSectionTitle(doc, 'Provisioning Jobs');
    pdfTable(doc,
      ['ID', 'Tenant', 'Task', 'Status', 'Started', 'Updated'],
      jobs.map((j) => [j.id, j.tenant, j.task, j.status, j.startedAt, j.updatedAt ?? ''])
    );

    doc.end();
  });
}
