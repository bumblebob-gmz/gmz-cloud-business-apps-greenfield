import { NextResponse } from 'next/server';
import { requireProtectedOperation } from '@/lib/auth-context';
import { appendAuditEvent, buildAuditEvent, getCorrelationIdFromRequest } from '@/lib/audit';
import { generateTenantReport, generateSummaryReport } from '@/lib/reporting/report-generator';
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
    
    if (options.format === 'csv') {
      return NextResponse.json({ error: 'CSV not implemented yet' }, { status: 501 });
    }

    let buffer: Buffer;
    let filename: string;

    if (options.reportType === 'tenant' && options.tenantId) {
      buffer = await generateTenantReport(options.tenantId, options);
      filename = `report-${options.tenantId}-${Date.now()}.pdf`;
    } else {
      buffer = await generateSummaryReport(options);
      filename = `platform-summary-${Date.now()}.pdf`;
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
        details: { type: options.reportType, format: options.format }
      })
    );

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    await appendAuditEvent(
      buildAuditEvent({
        correlationId,
        actor: { type: 'user', id: authz.auth.userId, role: authz.auth.role },
        tenantId: 'system',
        action: 'reports.generate.failure',
        resource: 'report',
        outcome: 'failure',
        source: { service: 'webapp', operation: 'POST /api/reports/generate' }
      })
    );
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
