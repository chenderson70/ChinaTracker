import dayjs from 'dayjs';

export function normalizeDateString(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const parsed = dayjs(normalized);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

export function formatDateValue(value: string | null | undefined, emptyLabel = 'Not set'): string {
  const normalized = normalizeDateString(value);
  if (!normalized) return emptyLabel;
  return dayjs(normalized).format('DD MMM YYYY');
}

export function formatDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  emptyLabel = 'Not set',
): string {
  const start = normalizeDateString(startDate);
  const end = normalizeDateString(endDate);

  if (!start && !end) return emptyLabel;
  if (start && end) {
    return `${dayjs(start).format('DD MMM YYYY')} - ${dayjs(end).format('DD MMM YYYY')}`;
  }
  return start
    ? `${dayjs(start).format('DD MMM YYYY')} - ...`
    : `... - ${dayjs(end!).format('DD MMM YYYY')}`;
}

export function calculateInclusiveDateRangeDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number | null {
  const start = normalizeDateString(startDate);
  const end = normalizeDateString(endDate);
  if (!start || !end) return null;

  const startDay = dayjs(start);
  const endDay = dayjs(end);
  if (!startDay.isValid() || !endDay.isValid() || endDay.isBefore(startDay, 'day')) {
    return null;
  }

  return endDay.diff(startDay, 'day') + 1;
}
