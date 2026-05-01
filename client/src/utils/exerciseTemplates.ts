import type { ExerciseTemplate } from '../types';

export const DEFAULT_EXERCISE_TEMPLATE: ExerciseTemplate = 'PATRIOT_MEDIC';

export const EXERCISE_TEMPLATE_OPTIONS: Array<{ value: ExerciseTemplate; label: string }> = [
  { value: 'PATRIOT_MEDIC', label: 'PATRIOT MEDIC' },
  { value: 'PATRIOT_PHOENIX', label: 'PATRIOT PHOENIX' },
  { value: 'PATRIOT_FORGE', label: 'PATRIOT FORGE' },
];

const EXERCISE_TEMPLATE_LABELS: Record<ExerciseTemplate, string> = {
  PATRIOT_MEDIC: 'PATRIOT MEDIC',
  PATRIOT_PHOENIX: 'PATRIOT PHOENIX',
  PATRIOT_FORGE: 'PATRIOT FORGE',
};

export function normalizeExerciseTemplate(value: string | null | undefined): ExerciseTemplate {
  const normalized = String(value || '').trim().toUpperCase();

  if (normalized === 'PATRIOT_PHOENIX') return 'PATRIOT_PHOENIX';
  if (normalized === 'PATRIOT_FORGE') return 'PATRIOT_FORGE';
  return DEFAULT_EXERCISE_TEMPLATE;
}

export function getExerciseTemplateLabel(value: string | null | undefined): string {
  return EXERCISE_TEMPLATE_LABELS[normalizeExerciseTemplate(value)];
}

export function getCostProjectionLabel(value: string | null | undefined): string {
  return `${getExerciseTemplateLabel(value)} Cost Projections`;
}
