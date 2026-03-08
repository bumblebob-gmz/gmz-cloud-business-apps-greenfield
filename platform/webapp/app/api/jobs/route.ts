import { NextResponse } from 'next/server';
import { jobs } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({ items: jobs });
}
