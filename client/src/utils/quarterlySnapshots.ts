import dayjs from 'dayjs';
import type { Exercise, QuarterlySnapshotKey } from '../types';
import { formatDateRange } from './dateRanges';

type ExerciseDateContext = Pick<Exercise, 'startDate' | 'endDate'> | { startDate?: string | null; endDate?: string | null } | null | undefined;

export type QuarterlySnapshotEntry = {
  key: QuarterlySnapshotKey;
  label: string;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  fiscalYear: number;
};

export const QUARTERLY_SNAPSHOT_META: Array<{ key: QuarterlySnapshotKey; label: string }> = [
  { key: 'q1', label: 'Q1' },
  { key: 'q2', label: 'Q2' },
  { key: 'q3', label: 'Q3' },
  { key: 'q4', label: 'Q4' },
];

export function getFiscalYearForExercise(exercise: ExerciseDateContext): number {
  const startDate = dayjs(exercise?.startDate);
  const endDate = dayjs(exercise?.endDate);
  const referenceDate = startDate.isValid() ? startDate : endDate.isValid() ? endDate : dayjs();
  return referenceDate.month() >= 9 ? referenceDate.year() + 1 : referenceDate.year();
}

export function getQuarterlySnapshotEntries(exercise: ExerciseDateContext): QuarterlySnapshotEntry[] {
  const fiscalYear = getFiscalYearForExercise(exercise);
  const quarterRanges: Array<[string, string]> = [
    [`${fiscalYear - 1}-10-01`, `${fiscalYear - 1}-12-31`],
    [`${fiscalYear}-01-01`, `${fiscalYear}-03-31`],
    [`${fiscalYear}-04-01`, `${fiscalYear}-06-30`],
    [`${fiscalYear}-07-01`, `${fiscalYear}-09-30`],
  ];

  return QUARTERLY_SNAPSHOT_META.map((item, index) => {
    const [startDate, endDate] = quarterRanges[index];
    return {
      ...item,
      startDate,
      endDate,
      rangeLabel: formatDateRange(startDate, endDate),
      fiscalYear,
    };
  });
}

export function buildQuarterlySnapshotNoteLine(key: QuarterlySnapshotKey, exercise: ExerciseDateContext): string {
  const entry = getQuarterlySnapshotEntries(exercise).find((item) => item.key === key);
  return entry ? `${entry.label}: ${entry.rangeLabel}` : '';
}

export function buildAllQuarterlySnapshotNoteLine(exercise: ExerciseDateContext): string {
  const entries = getQuarterlySnapshotEntries(exercise)
    .map((entry) => `${entry.label} ${entry.rangeLabel}`);

  return entries.length > 0 ? `Quarterly snapshot windows: ${entries.join('; ')}` : '';
}
