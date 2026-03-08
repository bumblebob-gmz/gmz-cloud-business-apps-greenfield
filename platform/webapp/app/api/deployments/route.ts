import { NextResponse } from 'next/server';
import { deployments } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({ items: deployments });
}
