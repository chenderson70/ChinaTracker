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

function isExcludedSupportOmGroup(role: string | null | undefined, fundingType: string | null | undefined): boolean {
  return String(role || '').toUpperCase() === 'SUPPORT' && String(fundingType || '').toUpperCase() === 'OM';
}

export function getSupportOmPaxExclusions(exercise: ExerciseDetail | null | undefined): {
  totalExcludedPax: number;
  excludedByUnit: Record<string, number>;
} {
  if (!exercise) {
    return { totalExcludedPax: 0, excludedByUnit: {} };
  }

  return (exercise.unitBudgets || []).reduce(
    (acc, unitBudget) => {
      const unitCode = String(unitBudget.unitCode || '').toUpperCase();
      const excludedForUnit = (unitBudget.personnelGroups || []).reduce((sum, group) => {
        if (!isExcludedSupportOmGroup(group.role, group.fundingType)) {
          return sum;
        }

        const entryTotal = (group.personnelEntries || []).reduce((entrySum, entry) => entrySum + Number(entry.count || 0), 0);
        return sum + (entryTotal || Number(group.paxCount || 0));
      }, 0);

      if (excludedForUnit > 0) {
        acc.excludedByUnit[unitCode] = excludedForUnit;
        acc.totalExcludedPax += excludedForUnit;
      }

      return acc;
    },
    { totalExcludedPax: 0, excludedByUnit: {} as Record<string, number> },
  );
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
      const excludedForUnit = (unitBudget.personnelGroups || []).reduce((sum, group) => {
        const planningEventPax = String(group.role || '').toUpperCase() === 'PLANNING'
          ? (group.personnelEntries || []).reduce(
            (entrySum, entry) => entrySum + (isExcludedPlanningPaxNote(entry.note) ? Number(entry.count || 0) : 0),
            0,
          )
          : 0;

        const supportOmPax = isExcludedSupportOmGroup(group.role, group.fundingType)
          ? ((group.personnelEntries || []).reduce((entrySum, entry) => entrySum + Number(entry.count || 0), 0) || Number(group.paxCount || 0))
          : 0;

        return sum + planningEventPax + supportOmPax;
      }, 0);

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

export function formatFundingPaxBreakdown(rpaPax: number, omPax: number): string {
  const parts: string[] = [];
  if (Number(rpaPax || 0) > 0) {
    parts.push(`${Number(rpaPax || 0)} RPA`);
  }
  if (Number(omPax || 0) > 0) {
    parts.push(`${Number(omPax || 0)} O&M`);
  }
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}
