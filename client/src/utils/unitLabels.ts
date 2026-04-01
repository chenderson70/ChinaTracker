export function getUnitDisplayLabel(unitCode: string): string {
  return String(unitCode || '').toUpperCase() === 'CAB' ? 'Unit of Action' : unitCode;
}
