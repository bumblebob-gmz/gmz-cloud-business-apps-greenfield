import { NextResponse } from 'next/server';
import { listDeployments } from '@/lib/data-store';

export async function GET() {
  const items = await listDeployments();
  return NextResponse.json({ items });
}
