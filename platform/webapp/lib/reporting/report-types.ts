export type ReportFormat = 'pdf' | 'csv';
export type ReportType = 'tenant' | 'summary';

export interface ReportOptions {
  reportType: ReportType;
  format: ReportFormat;
  tenantId?: string;
  dateRange?: {
    from: string;
    to: string;
  };
}
