import { listReports } from '@/lib/data-store';

function escapeCsvValue(value: string) {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export async function GET() {
  const reports = await listReports();

  const header = ['id', 'title', 'owner', 'period', 'generatedAt'];
  const rows = reports.map((report) =>
    [report.id, report.title, report.owner, report.period, report.generatedAt].map((value) => escapeCsvValue(String(value))).join(',')
  );

  const csv = [header.join(','), ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="reports.csv"',
      'Cache-Control': 'no-store'
    }
  });
}
