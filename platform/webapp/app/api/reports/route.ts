import { NextResponse } from 'next/server';
import { reports } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({ items: reports });
}
