import { NextResponse } from 'next/server';
import { getProvisionPreflight } from '@/lib/provisioning';

export async function GET() {
  return NextResponse.json(getProvisionPreflight());
}
