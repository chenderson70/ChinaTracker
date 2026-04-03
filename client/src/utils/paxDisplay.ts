import type { ExerciseDetail } from '../types';

function normalizePlanningNote(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function isExcludedPlanningPaxNote(value: string | null | undefined): boolean {
  const normalized = normalizePlanningNote(value);
  return [
    'site visit',
    'planning conference',
    'initial planning conference',
    'mid planning conference',
    'final planning conference',
  ].includes(normalized);
}

export function getPlanningEventPaxExclusions(exercise: ExerciseDetail | null | undefined): {
  totalExcludedPax: number;
  excludedByUnit: Record<string, number>;
} {
  if (!exercise) {
    return { totalExcludedPax: 0, excludedByUnit: {} };
  }

  return (exercise.unitBudgets || []).reduce(
    (acc, unitBudget) => {
      const unitCode = String(unitBudget.unitCode || '').toUpperCase();
      const excludedForUnit = (unitBudget.personnelGroups || [])
        .filter((group) => group.role === 'PLANNING')
        .flatMap((group) => group.personnelEntries || [])
        .reduce(
          (sum, entry) => sum + (isExcludedPlanningPaxNote(entry.note) ? Number(entry.count || 0) : 0),
          0,
        );

      if (excludedForUnit > 0) {
        acc.excludedByUnit[unitCode] = excludedForUnit;
        acc.totalExcludedPax += excludedForUnit;
      }

      return acc;
    },
    { totalExcludedPax: 0, excludedByUnit: {} as Record<string, number> },
  );
}

export function getDisplayedPax(totalPax: number, excludedPax: number): number {
  return Math.max(0, Number(totalPax || 0) - Number(excludedPax || 0));
}
