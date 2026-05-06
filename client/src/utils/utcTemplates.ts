export type UtcTemplate = {
  code: string;
  title: string;
  alignment: UtcAlignment;
  defaultPax: number | null;
  officers: number | null;
  enlisted: number | null;
  sourceFile: string;
  entries?: UtcTemplateEntry[];
};

export type UtcAlignment = 'SG' | 'AE';

export type UtcTemplateEntry = {
  rankCode: string;
  count: number;
};

export const PATRIOT_UTC_TEMPLATES: UtcTemplate[] = [
  { code: 'FFEP2', title: 'MED EMEDS/AFTH C2 MED', alignment: 'SG', defaultPax: 6, officers: 2, enlisted: 4, sourceFile: 'FFEP2_EMEDS C2 MISCAP.pdf' },
  { code: 'FFEP3', title: 'EMEDS/AFTH 10', alignment: 'SG', defaultPax: 23, officers: 8, enlisted: 15, sourceFile: 'FFEP3 EMEDS 10 MISCAP.pdf' },
  {
    code: 'FFEP4',
    title: 'EMEDS/AFTH 25',
    alignment: 'SG',
    defaultPax: 24,
    officers: 9,
    enlisted: 15,
    sourceFile: 'FFEP4 EMEDS 25 MISCAP.pdf',
    entries: [
      { rankCode: 'LTCOL', count: 1 },
      { rankCode: 'MAJ', count: 5 },
      { rankCode: 'CAPT', count: 3 },
      { rankCode: 'TSGT', count: 15 },
    ],
  },
  { code: 'FFEP6', title: 'MED EMEDS/AFTH-NURSIN-ANCIL AUG', alignment: 'SG', defaultPax: 10, officers: 4, enlisted: 6, sourceFile: 'FFEP6 EMEDS NURSING ANCIL AUG_MISCAP.pdf' },
  {
    code: 'FFEPS',
    title: 'ERPSS-10',
    alignment: 'SG',
    defaultPax: 18,
    officers: 8,
    enlisted: 10,
    sourceFile: 'FFEPS_ERPSS 10 MISCAP.pdf',
    entries: [
      { rankCode: 'LTCOL', count: 2 },
      { rankCode: 'MAJ', count: 2 },
      { rankCode: 'CAPT', count: 4 },
      { rankCode: 'TSGT', count: 10 },
    ],
  },
  { code: 'FFF0C', title: 'MED DENTAL AUGMENTATION TEAM', alignment: 'SG', defaultPax: 2, officers: 1, enlisted: 1, sourceFile: 'FFF0C EMEDS DENTAL AUG MISCAP.pdf' },
  {
    code: 'FFFPS',
    title: 'ERPSS-50',
    alignment: 'SG',
    defaultPax: 35,
    officers: 12,
    enlisted: 23,
    sourceFile: 'FFFPS_ERPSS 50 MISCAP.pdf',
    entries: [
      { rankCode: 'LTCOL', count: 1 },
      { rankCode: 'MAJ', count: 7 },
      { rankCode: 'CAPT', count: 4 },
      { rankCode: 'TSGT', count: 23 },
    ],
  },
  {
    code: 'FFGST',
    title: 'GROUND SURG TEAM',
    alignment: 'SG',
    defaultPax: 6,
    officers: 5,
    enlisted: 1,
    sourceFile: 'FFGST GROUND SURG TEAM MISCAP.pdf',
    entries: [
      { rankCode: 'MAJ', count: 5 },
      { rankCode: 'TSGT', count: 1 },
    ],
  },
  {
    code: 'FFHPS',
    title: 'ERPSS-100',
    alignment: 'SG',
    defaultPax: 28,
    officers: 7,
    enlisted: 21,
    sourceFile: 'FFHPS_ERPSS 100 MISCAP.pdf',
    entries: [
      { rankCode: 'LTCOL', count: 1 },
      { rankCode: 'MAJ', count: 4 },
      { rankCode: 'CAPT', count: 2 },
      { rankCode: 'TSGT', count: 21 },
    ],
  },
  { code: 'FFP01', title: 'MED EMEDS SPEC CARE TM', alignment: 'SG', defaultPax: 7, officers: 4, enlisted: 3, sourceFile: 'FFP01 EMEDS SPEC CARE TEAM MISCAP.pdf' },
  { code: 'FFPCM', title: 'MED PRIMARY CARE TEAM', alignment: 'SG', defaultPax: 3, officers: 1, enlisted: 2, sourceFile: 'FFPCM EMEDS PRI CARE TEAM MISCAP.pdf' },
  { code: 'FFPM1', title: 'MED PREV & AERO MED TM 1', alignment: 'SG', defaultPax: 4, officers: 3, enlisted: 1, sourceFile: 'FFPM1 PREV MED TEAM MISCAP.pdf' },
  { code: 'FFPM2', title: 'MED PREV & AERO MED TM 2', alignment: 'SG', defaultPax: 2, officers: 0, enlisted: 2, sourceFile: 'FFPM2 BIO PUB HEALTH PAM TEAM MISCAP.pdf' },
  { code: 'FFPM3', title: 'MED PREV & AERO MED TM 3', alignment: 'SG', defaultPax: 3, officers: 0, enlisted: 3, sourceFile: 'FFPM3 BIO PUB HEALTH PAM 1 AND 2 MISCAP.pdf' },
  {
    code: 'FFQCC',
    title: 'AE Command Squadron',
    alignment: 'AE',
    defaultPax: 8,
    officers: 4,
    enlisted: 4,
    sourceFile: 'FFQCC_AE COMMAND SQ MISCAP.pdf',
    entries: [
      { rankCode: 'LTCOL', count: 1 },
      { rankCode: 'MAJ', count: 3 },
      { rankCode: 'TSGT', count: 4 },
    ],
  },
  { code: 'FFQCR', title: 'COMMUNICATIONS TM', alignment: 'AE', defaultPax: 2, officers: 0, enlisted: 2, sourceFile: 'FFQCR_AE COMM MISCAP.pdf' },
  { code: 'FFQDE', title: 'INTRATHEATER AIR CREW', alignment: 'AE', defaultPax: 5, officers: 2, enlisted: 3, sourceFile: 'FFQDE_AE CREW MISCAP.pdf' },
  {
    code: 'FFQLL',
    title: 'Liaison Team (AELT)',
    alignment: 'AE',
    defaultPax: 2,
    officers: 2,
    enlisted: 0,
    sourceFile: 'FFQLL_AE LIAISON TEAM MISCAP.pdf',
    entries: [
      { rankCode: 'CAPT', count: 2 },
    ],
  },
  {
    code: 'FFQNT',
    title: 'AE Operations Team (AEOT)',
    alignment: 'AE',
    defaultPax: 10,
    officers: 4,
    enlisted: 6,
    sourceFile: 'FFQNT_AE OPERATIONS TEAM MISCAP.pdf',
    entries: [
      { rankCode: 'LTCOL', count: 2 },
      { rankCode: 'CAPT', count: 2 },
      { rankCode: 'TSGT', count: 6 },
    ],
  },
];

const UTC_TEMPLATES_BY_CODE = new Map(PATRIOT_UTC_TEMPLATES.map((template) => [template.code, template]));

export function getUtcTemplateByCode(code: string | null | undefined): UtcTemplate | null {
  return UTC_TEMPLATES_BY_CODE.get(String(code || '').trim().toUpperCase()) || null;
}

export function getUtcAlignmentLabel(alignment: UtcAlignment): string {
  return alignment === 'AE' ? 'AE' : 'SG';
}

export function getUtcTemplatesForUnit(unitCode: string | null | undefined): UtcTemplate[] {
  const normalizedUnitCode = String(unitCode || '').trim().toUpperCase();
  if (normalizedUnitCode === 'AE') {
    return PATRIOT_UTC_TEMPLATES.filter((template) => template.alignment === 'AE');
  }
  if (normalizedUnitCode === 'SG') {
    return PATRIOT_UTC_TEMPLATES.filter((template) => template.alignment === 'SG');
  }
  return [];
}

export function getUtcTemplateLabel(template: UtcTemplate): string {
  const paxLabel = template.defaultPax === null ? 'PAX review needed' : `${template.defaultPax} PAX`;
  return `${template.code} - ${template.title} (${paxLabel})`;
}

export function getUtcDisplayTitle(code: string | null | undefined, title: string | null | undefined): string {
  const template = getUtcTemplateByCode(code);
  if (template) return template.title;
  return String(title || '').trim();
}

export function getUtcPackageCountFromNote(note: string | null | undefined): number {
  const match = String(note || '').match(/^\s*UTC\s+\S+\s+x\s*(\d+)\s*$/i);
  return match ? Math.max(1, Number(match[1] || 1)) : 0;
}

export function getUtcPackageCount(
  code: string | null | undefined,
  pax: number,
  notePackageCount = 0,
): number {
  const template = getUtcTemplateByCode(code);
  const defaultPax = Number(template?.defaultPax || 0);

  if (notePackageCount > 0) {
    return Math.max(1, Math.round(Number(notePackageCount || 0)));
  }

  if (defaultPax > 0) {
    return Math.max(1, Math.round(Number(pax || 0) / defaultPax));
  }

  return 1;
}

export function buildUtcTemplateEntries(template: UtcTemplate, overridePax?: number | null): UtcTemplateEntry[] {
  if (template.entries && template.entries.length > 0 && !overridePax) {
    return template.entries.map((entry) => ({ ...entry }));
  }

  const total = Math.max(1, Number(overridePax ?? template.defaultPax ?? 1));
  const officers = template.officers === null ? 0 : Math.max(0, Number(template.officers || 0));
  const enlisted = template.enlisted === null ? total : Math.max(0, Number(template.enlisted || 0));

  if (template.officers === null || template.enlisted === null) {
    return [{ rankCode: 'TSGT', count: total }];
  }

  const rows: UtcTemplateEntry[] = [];
  if (officers > 0) rows.push({ rankCode: 'CAPT', count: officers });
  if (enlisted > 0) rows.push({ rankCode: 'TSGT', count: enlisted });
  const accountedFor = rows.reduce((sum, row) => sum + row.count, 0);
  if (accountedFor < total) rows.push({ rankCode: 'TSGT', count: total - accountedFor });
  return rows.length > 0 ? rows : [{ rankCode: 'TSGT', count: total }];
}
