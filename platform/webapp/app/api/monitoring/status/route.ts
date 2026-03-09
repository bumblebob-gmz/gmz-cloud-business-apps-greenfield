import { NextResponse } from 'next/server';
import { requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/monitoring/status');
  if (!authz.ok) return authz.response;

  return NextResponse.json({
    enabled: process.env.MONITORING_ENABLED === 'true',
    prometheusUrl: process.env.PROMETHEUS_URL || undefined,
    grafanaUrl: process.env.GRAFANA_URL || undefined,
    lokiUrl: process.env.LOKI_URL || undefined
  });
}
