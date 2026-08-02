import type { ReportMetricValue } from '@titan/shared';
import { formatMoney } from '@titan/shared';

export function formatReportMetricValue(value: ReportMetricValue): string {
  switch (value.kind) {
    case 'money':
      return formatMoney(value.cents, value.currency);
    case 'count':
      return String(value.count);
    case 'percent':
      return `${value.percent}%`;
    case 'hours':
      return `${value.hours}h`;
    case 'text':
      return value.text;
    case 'unavailable':
      return '—';
    default:
      return '—';
  }
}

export function isMetricUnavailable(value: ReportMetricValue): boolean {
  return value.kind === 'unavailable';
}
