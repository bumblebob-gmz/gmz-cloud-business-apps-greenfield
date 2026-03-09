export type ReportFormat = 'pdf' | 'csv';
export type ReportType = 'summary' | 'tenant' | 'tenant-list' | 'audit-events' | 'provisioning-history';

export interface ReportOptions {
  reportType: ReportType;
  format: ReportFormat;
  tenantId?: string;
  dateRange?: {
    from: string;
    to: string;
  };
  /** Optional audit-event filters when reportType === 'audit-events' */
  auditFilters?: {
    outcome?: 'success' | 'failure' | 'denied';
    actionContains?: string;
    since?: string;
    limit?: number;
  };
}
