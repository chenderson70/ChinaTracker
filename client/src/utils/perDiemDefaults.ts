export const DEFAULT_UI_PER_DIEM_LOCATIONS = [
  'FORT_HUNTER_LIGGETT',
  'MARIETTA',
  'WARNER_ROBINS',
] as const;

const DEFAULT_UI_PER_DIEM_LOCATION_RANK = new Map<string, number>(
  DEFAULT_UI_PER_DIEM_LOCATIONS.map((location, index) => [location, index]),
);

function normalizeLocation(location: string | null | undefined): string {
  return String(location || '').trim().toUpperCase();
}

export function isDefaultUiPerDiemLocation(location: string | null | undefined): boolean {
  return DEFAULT_UI_PER_DIEM_LOCATION_RANK.has(normalizeLocation(location));
}

export function sortUiPerDiemLocations(locations: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      locations
        .map((location) => normalizeLocation(location))
        .filter(Boolean),
    ),
  ).sort((left, right) => {
    const leftRank = DEFAULT_UI_PER_DIEM_LOCATION_RANK.get(left);
    const rightRank = DEFAULT_UI_PER_DIEM_LOCATION_RANK.get(right);

    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
    if (leftRank !== undefined) return -1;
    if (rightRank !== undefined) return 1;
    return left.localeCompare(right);
  });
}

export function sortUiPerDiemRateRows<T extends { location: string | null | undefined }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftLocation = normalizeLocation(left.location);
    const rightLocation = normalizeLocation(right.location);
    const leftRank = DEFAULT_UI_PER_DIEM_LOCATION_RANK.get(leftLocation);
    const rightRank = DEFAULT_UI_PER_DIEM_LOCATION_RANK.get(rightLocation);

    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
    if (leftRank !== undefined) return -1;
    if (rightRank !== undefined) return 1;
    return leftLocation.localeCompare(rightLocation);
  });
}
