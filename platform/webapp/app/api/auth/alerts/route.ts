import { NextResponse } from 'next/server';
import { buildAuthAlerts } from '@/lib/auth-alerts';
import { getTrustedTokenHealthSummary, requireProtectedOperation } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/auth/alerts');
  if (!authz.ok) return authz.response;

  const summary = getTrustedTokenHealthSummary(process.env.WEBAPP_TRUSTED_TOKENS_JSON, { env: process.env });
  const alerts = buildAuthAlerts(summary);

  return NextResponse.json({ alerts });
}
