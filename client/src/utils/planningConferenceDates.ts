import type {
  PlanningConferenceDateRange,
  PlanningConferenceDates,
  PlanningConferenceKey,
} from '../types';
import { calculateInclusiveDateRangeDays, normalizeDateString } from './dateRanges';

const EMPTY_RANGE: PlanningConferenceDateRange = {
  startDate: '',
  endDate: '',
};

const EMPTY_DATES: PlanningConferenceDates = {
  initial: { ...EMPTY_RANGE },
  mid: { ...EMPTY_RANGE },
  final: { ...EMPTY_RANGE },
};

const NOTE_TO_KEY: Record<string, PlanningConferenceKey> = {
  'initial planning conference': 'initial',
  'mid planning conference': 'mid',
  'final planning conference': 'final',
};

function normalizePlanningConferenceDateRange(
  value: Partial<PlanningConferenceDateRange> | null | undefined,
): PlanningConferenceDateRange {
  return {
    startDate: normalizeDateString(value?.startDate) || '',
    endDate: normalizeDateString(value?.endDate) || '',
  };
}

export function normalizePlanningConferenceDates(
  value: Partial<Record<PlanningConferenceKey, Partial<PlanningConferenceDateRange> | null>> | null | undefined,
): PlanningConferenceDates {
  return {
    initial: normalizePlanningConferenceDateRange(value?.initial),
    mid: normalizePlanningConferenceDateRange(value?.mid),
    final: normalizePlanningConferenceDateRange(value?.final),
  };
}

export function getEmptyPlanningConferenceDates(): PlanningConferenceDates {
  return {
    initial: { ...EMPTY_DATES.initial },
    mid: { ...EMPTY_DATES.mid },
    final: { ...EMPTY_DATES.final },
  };
}

export function getPlanningConferenceKeyFromNote(
  value: string | null | undefined,
): PlanningConferenceKey | null {
  const normalized = String(value || '').trim().toLowerCase();
  return NOTE_TO_KEY[normalized] || null;
}

export function getPlanningConferenceRangeForNote(
  planningConferenceDates: PlanningConferenceDates | null | undefined,
  note: string | null | undefined,
): PlanningConferenceDateRange | null {
  const key = getPlanningConferenceKeyFromNote(note);
  if (!key) return null;

  const normalized = normalizePlanningConferenceDates(planningConferenceDates);
  const range = normalized[key];
  return range.startDate && range.endDate ? range : null;
}

export function getPlanningConferenceDutyDays(
  range: PlanningConferenceDateRange | null | undefined,
): number | null {
  return calculateInclusiveDateRangeDays(range?.startDate, range?.endDate);
}
