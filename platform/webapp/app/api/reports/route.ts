import { NextResponse } from 'next/server';
import { listReports } from '@/lib/data-store';

export async function GET() {
  const items = await listReports();
  return NextResponse.json({ items });
}
