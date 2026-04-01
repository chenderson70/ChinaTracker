const UNIT_SORT_ORDER = ['A7', 'SG', 'AE', 'CAB'];

export function getUnitDisplayLabel(unitCode: string): string {
  return String(unitCode || '').toUpperCase() === 'CAB' ? 'Unit of Action' : unitCode;
}

export function compareUnitCodes(left: string, right: string): number {
  const normalizedLeft = String(left || '').toUpperCase();
  const normalizedRight = String(right || '').toUpperCase();
  const leftIndex = UNIT_SORT_ORDER.indexOf(normalizedLeft);
  const rightIndex = UNIT_SORT_ORDER.indexOf(normalizedRight);

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  }

  return normalizedLeft.localeCompare(normalizedRight);
}
