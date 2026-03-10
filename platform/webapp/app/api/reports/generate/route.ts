import { NextResponse } from 'next/server';
import { requireProtectedOperation } from '@/lib/auth-context';

function sanitizeFilename(input: string | undefined | null): string {
  if (!input) return 'unknown';
  return input.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 64);
}
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest, listAuditEvents, toAuditEventsCsv } from '@/lib/audit';
import {
  generateTenantReport,
  generateSummaryReport,
  generateTenantListPdf,
  generateAuditEventsPdf,
  generateProvisioningHistoryPdf,
  tenantListToCsv,
  provisioningHistoryToCsv
} from '@/lib/reporting/report-generator';
import { listTenants, listJobs } from '@/lib/data-store';
import type { ReportOptions } from '@/lib/reporting/report-types';

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const authz = await requireProtectedOperation(request, 'POST /api/reports/generate');

  if (!authz.ok) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: 'unknown' },
        tenantId: 'system',
        action: 'reports.generate.denied',
        resource: 'report',
        outcome: 'denied',
        source: { service: 'webapp', operation: 'POST /api/reports/generate' }
      })
    );
    return authz.response;
  }

  try {
    const options = (await request.json()) as ReportOptions;
    const { reportType, format } = options;

    let buffer: Buffer | null = null;
    let csvContent: string | null = null;
    let filename = `report-${Date.now()}`;

    // Fetch data needed for this report type
    const tenants = await listTenants();
    const jobs = await listJobs();

    if (format === 'csv') {
      // ── CSV branch ───────────────────────────────────────────────────────
      switch (reportType) {
        case 'tenant-list':
        case 'summary': {
          csvContent = tenantListToCsv(tenants);
          filename = `tenant-list-${Date.now()}.csv`;
          break;
        }
        case 'audit-events': {
          const filters = {
            limit: options.auditFilters?.limit ?? 200,
            outcome: options.auditFilters?.outcome,
            actionContains: options.auditFilters?.actionContains,
            since: options.auditFilters?.since
          };
          const events = await listAuditEvents(filters);
          csvContent = toAuditEventsCsv(events);
          filename = `audit-events-${Date.now()}.csv`;
          break;
        }
        case 'provisioning-history': {
          csvContent = provisioningHistoryToCsv(jobs);
          filename = `provisioning-history-${Date.now()}.csv`;
          break;
        }
        case 'tenant': {
          const tenantJobs = jobs.filter(
            (j) => j.tenant === options.tenantId || j.tenant.toLowerCase() === (options.tenantId ?? '').toLowerCase()
          );
          csvContent = provisioningHistoryToCsv(tenantJobs);
          filename = `tenant-${sanitizeFilename(options.tenantId)}-${Date.now()}.csv`;
          break;
        }
        default: {
          return NextResponse.json({ error: `Unknown reportType: ${reportType}` }, { status: 400 });
        }
      }
    } else {
      // ── PDF branch ───────────────────────────────────────────────────────
      switch (reportType) {
        case 'tenant-list': {
          buffer = await generateTenantListPdf(tenants, options);
          filename = `tenant-list-${Date.now()}.pdf`;
          break;
        }
        case 'audit-events': {
          const filters = {
            limit: options.auditFilters?.limit ?? 200,
            outcome: options.auditFilters?.outcome,
            actionContains: options.auditFilters?.actionContains,
            since: options.auditFilters?.since
          };
          const events = await listAuditEvents(filters);
          buffer = await generateAuditEventsPdf(events, options);
          filename = `audit-events-${Date.now()}.pdf`;
          break;
        }
        case 'provisioning-history': {
          buffer = await generateProvisioningHistoryPdf(jobs, options);
          filename = `provisioning-history-${Date.now()}.pdf`;
          break;
        }
        case 'tenant': {
          buffer = await generateTenantReport(options.tenantId ?? '', options, tenants);
          filename = `tenant-${sanitizeFilename(options.tenantId)}-${Date.now()}.pdf`;
          break;
        }
        case 'summary':
        default: {
          buffer = await generateSummaryReport(options, tenants, jobs);
          filename = `platform-summary-${Date.now()}.pdf`;
          break;
        }
      }
    }

    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: options.tenantId || 'system',
        action: 'reports.generate.success',
        resource: 'report',
        outcome: 'success',
        source: { service: 'webapp', operation: 'POST /api/reports/generate' },
        details: { type: reportType, format }
      })
    );

    if (csvContent !== null) {
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'no-store'
        }
      });
    }

    return new NextResponse(buffer!, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth?.userId ?? 'unknown', role: authz.auth?.role },
        tenantId: 'system',
        action: 'reports.generate.failure',
        resource: 'report',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/reports/generate' },
        details: { error: String(error) }
      })
    );
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
