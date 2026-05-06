export const LONG_TOUR_LEAVE_THRESHOLD_DAYS = 30;

export interface LongTourLeaveAccrual {
  orderDays: number | null;
  accruedLeaveDays: number;
  payableDutyDays: number | null;
  applies: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeDateValue(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePositiveDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function roundToHalfDay(value: number): number {
  return Math.round(value * 2) / 2;
}

function getResidualLeaveDays(residualDays: number): number {
  if (residualDays <= 0) return 0;
  if (residualDays <= 6) return 0.5;
  if (residualDays <= 12) return 1;
  if (residualDays <= 18) return 1.5;
  if (residualDays <= 24) return 2;
  return 2.5;
}

function calculateInclusiveDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;

  const start = dateFromIso(startDate);
  const end = dateFromIso(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return null;
  }

  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

function calculateFallbackLeaveDays(orderDays: number): number {
  if (orderDays <= LONG_TOUR_LEAVE_THRESHOLD_DAYS) return 0;

  const fullThirtyDayPeriods = Math.floor(orderDays / 30);
  const residualDays = orderDays - (fullThirtyDayPeriods * 30);
  return roundToHalfDay((fullThirtyDayPeriods * 2.5) + getResidualLeaveDays(residualDays));
}

export function calculateLongTourLeaveAccrual(
  startDate: unknown,
  endDate: unknown,
  fallbackOrderDays?: number | null,
): LongTourLeaveAccrual {
  const normalizedStartDate = normalizeDateValue(startDate);
  const normalizedEndDate = normalizeDateValue(endDate);
  const dateRangeOrderDays = calculateInclusiveDays(normalizedStartDate, normalizedEndDate);
  const orderDays = dateRangeOrderDays ?? normalizePositiveDays(fallbackOrderDays);

  if (!orderDays) {
    return {
      orderDays: null,
      accruedLeaveDays: 0,
      payableDutyDays: null,
      applies: false,
    };
  }

  const accruedLeaveDays = calculateFallbackLeaveDays(orderDays);

  return {
    orderDays,
    accruedLeaveDays,
    payableDutyDays: orderDays + accruedLeaveDays,
    applies: accruedLeaveDays > 0,
  };
}

export function getLongTourLeaveFieldValue(accrual: LongTourLeaveAccrual): number | null {
  return accrual.accruedLeaveDays > 0 ? accrual.accruedLeaveDays : null;
}
