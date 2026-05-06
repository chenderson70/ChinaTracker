import { calculateInclusiveDateRangeDays, normalizeDateString } from './dateRanges';

export const LONG_TOUR_LEAVE_THRESHOLD_DAYS = 30;

export interface LongTourLeaveAccrual {
  orderDays: number | null;
  accruedLeaveDays: number;
  payableDutyDays: number | null;
  applies: boolean;
}

function normalizePositiveDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.max(1, Math.round(value));
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

function calculateFallbackLeaveDays(orderDays: number): number {
  if (orderDays <= LONG_TOUR_LEAVE_THRESHOLD_DAYS) return 0;

  const fullThirtyDayPeriods = Math.floor(orderDays / 30);
  const residualDays = orderDays - (fullThirtyDayPeriods * 30);
  return roundToHalfDay((fullThirtyDayPeriods * 2.5) + getResidualLeaveDays(residualDays));
}

export function calculateLongTourLeaveAccrual(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  fallbackOrderDays?: number | null,
): LongTourLeaveAccrual {
  const normalizedStartDate = normalizeDateString(startDate);
  const normalizedEndDate = normalizeDateString(endDate);
  const dateRangeOrderDays = calculateInclusiveDateRangeDays(normalizedStartDate, normalizedEndDate);
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

export function formatLongTourLeaveDays(value: number): string {
  const roundedValue = roundToHalfDay(Math.max(0, Number(value) || 0));
  const displayValue = Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(1);
  return `${displayValue} ${roundedValue === 1 ? 'day' : 'days'}`;
}
