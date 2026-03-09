import { NextResponse } from 'next/server';
import { getTrustedTokenHealthSummary, requireProtectedOperation, resolveAuthMode } from '@/lib/auth-context';

export async function GET(request: Request) {
  const authz = await requireProtectedOperation(request, 'GET /api/auth/health');
  if (!authz.ok) return authz.response;

  return NextResponse.json({
    authMode: resolveAuthMode(),
    trustedTokens: getTrustedTokenHealthSummary(process.env.WEBAPP_TRUSTED_TOKENS_JSON, { env: process.env }),
    devRoleSwitchEnabled: process.env.NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH === 'true'
  });
}
