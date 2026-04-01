import { Card, Table, Typography } from 'antd';
import { useApp } from '../components/AppLayout';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { ReportsPage } from './Reports';
import type { ExecutionCostLine, FundingType, PersonnelEntry, PersonnelGroup, UnitBudget, UnitCalc } from '../types';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const DAYS_PER_MONTH = 30;

const LOCATION_LABELS: Record<string, string> = {
  GULFPORT: 'Gulfport',
  CAMP_SHELBY: 'Camp Shelby',
  WARNER_ROBINS: 'Robins AFB',
  ROBINS_AFB: 'Robins AFB',
  MARIETTA: 'Dobbins ARB',
  DOBBINS_ARB: 'Dobbins ARB',
};

type ProjectionCell = {
  total: number;
  details: string[];
};

type ProjectionRow = {
  key: string;
  planningRpa: ProjectionCell;
  planningOm: ProjectionCell;
  playerRpa: ProjectionCell;
  playerOm: ProjectionCell;
  executionRpa: ProjectionCell;
  executionOm: ProjectionCell;
};

function pluralize(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatLocation(location: string | null | undefined): string {
  const normalized = String(location || '').trim().toUpperCase();
  if (!normalized) return 'Unknown Location';
  return LOCATION_LABELS[normalized] || toTitleCase(normalized.replace(/_/g, ' '));
}

function formatExecutionCategory(category: string | null | undefined): string {
  const normalized = String(category || '').trim().toUpperCase();
  if (normalized === 'UFR' || normalized === 'WRM') return 'WRM (10%)';
  if (normalized === 'GPC_PURCHASES') return 'GPC Purchases';
  if (!normalized) return 'Execution Cost';
  return toTitleCase(normalized.replace(/_/g, ' '));
}

function formatDuration(dutyDays: number | null | undefined): string {
  const days = Number(dutyDays || 0);
  if (!days) return '0 days';
  const months = days / DAYS_PER_MONTH;
  return Number.isInteger(months) ? pluralize(months, 'month') : pluralize(days, 'day');
}

function buildPersonnelDetail(
  entry: Partial<PersonnelEntry>,
  group: PersonnelGroup,
  defaultDutyDays: number,
  prefix?: string,
): string | null {
  const count = Number(entry.count ?? group.paxCount ?? 0);
  if (count <= 0) return null;

  const rank = String(entry.rankCode || 'Personnel').toUpperCase();
  const duration = formatDuration(entry.dutyDays ?? group.dutyDays ?? defaultDutyDays);
  const location = formatLocation(entry.location ?? group.location);
  const locality = (entry.isLocal ?? group.isLocal) ? 'Local' : 'Not local';
  const note = String(entry.note || '').trim();
  const travelOnly = entry.travelOnly ? ' - Travel only' : '';
  const detail = `${count} ${rank} - ${duration} - ${location} - ${locality}${travelOnly}${note ? ` (${note})` : ''}`;

  return prefix ? `${prefix} - ${detail}` : detail;
}

function getPersonnelDetails(groups: PersonnelGroup[], defaultDutyDays: number, includeRolePrefix = false): string[] {
  return groups.flatMap((group) => {
    const fallbackEntry: Partial<PersonnelEntry> = {
      count: group.paxCount || 0,
      dutyDays: group.dutyDays ?? defaultDutyDays,
      location: group.location,
      isLocal: group.isLocal,
    };
    const entries = group.personnelEntries.length > 0 ? group.personnelEntries : [fallbackEntry];
    const prefix = includeRolePrefix ? (group.role === 'SUPPORT' ? 'Support' : 'Support Personnel - Execution') : undefined;

    return entries
      .map((entry) => buildPersonnelDetail(entry, group, defaultDutyDays, prefix))
      .filter((detail): detail is string => !!detail);
  });
}

function getExecutionLineDetails(lines: ExecutionCostLine[]): string[] {
  return lines.map((line) => {
    const category = formatExecutionCategory(line.category);
    const notes = String(line.notes || '').trim();
    const normalizedNotes = notes.toLowerCase();
    const shouldShowNotes = notes
      && !normalizedNotes.startsWith('a7_wrm_overall:')
      && normalizedNotes !== 'gpc purchases o&m cost'
      && normalizedNotes !== category.toLowerCase();

    return shouldShowNotes ? `${category} - ${notes} - ${fmt(line.amount || 0)}` : `${category} - ${fmt(line.amount || 0)}`;
  });
}

function buildProjectionCell(
  total: number,
  personnelGroups: PersonnelGroup[],
  defaultDutyDays: number,
  executionLines: ExecutionCostLine[] = [],
  includeRolePrefix = false,
): ProjectionCell {
  return {
    total,
    details: [
      ...getPersonnelDetails(personnelGroups, defaultDutyDays, includeRolePrefix),
      ...getExecutionLineDetails(executionLines),
    ],
  };
}

function renderProjectionCell(value: ProjectionCell) {
  return (
    <div style={{ minHeight: 92 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {fmt(value.total)}
      </Typography.Text>
      {value.details.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.details.map((detail) => (
            <Typography.Text key={detail} style={{ fontSize: 12, lineHeight: 1.4 }}>
              {detail}
            </Typography.Text>
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          No entries yet
        </Typography.Text>
      )}
    </div>
  );
}

function findGroups(unitBudget: UnitBudget | undefined, role: string, fundingType: FundingType): PersonnelGroup[] {
  return (unitBudget?.personnelGroups || []).filter(
    (group) => group.role === role && group.fundingType === fundingType,
  );
}

function findExecutionGroups(unitBudget: UnitBudget | undefined, fundingType: FundingType): PersonnelGroup[] {
  return (unitBudget?.personnelGroups || []).filter(
    (group) => (group.role === 'WHITE_CELL' || group.role === 'SUPPORT') && group.fundingType === fundingType,
  );
}

function findExecutionLines(unitBudget: UnitBudget | undefined, fundingType: FundingType): ExecutionCostLine[] {
  return (unitBudget?.executionCostLines || []).filter((line) => line.fundingType === fundingType);
}

function buildProjectionRow(unitBudget: UnitBudget | undefined, unitCalc: UnitCalc, defaultDutyDays: number): ProjectionRow {
  const planningRpaGroups = findGroups(unitBudget, 'PLANNING', 'RPA');
  const planningOmGroups = findGroups(unitBudget, 'PLANNING', 'OM');
  const playerRpaGroups = findGroups(unitBudget, 'PLAYER', 'RPA');
  const playerOmGroups = findGroups(unitBudget, 'PLAYER', 'OM');
  const executionRpaGroups = findExecutionGroups(unitBudget, 'RPA');
  const executionOmGroups = findExecutionGroups(unitBudget, 'OM');
  const executionRpaLines = findExecutionLines(unitBudget, 'RPA');
  const executionOmLines = findExecutionLines(unitBudget, 'OM');

  return {
    key: unitCalc.unitCode,
    planningRpa: buildProjectionCell(unitCalc.planningRpa.subtotal, planningRpaGroups, defaultDutyDays),
    planningOm: buildProjectionCell(unitCalc.planningOm.subtotal, planningOmGroups, defaultDutyDays),
    playerRpa: buildProjectionCell(unitCalc.playerRpa.subtotal, playerRpaGroups, defaultDutyDays),
    playerOm: buildProjectionCell(unitCalc.playerOm.subtotal, playerOmGroups, defaultDutyDays),
    executionRpa: buildProjectionCell(
      (unitCalc.whiteCellRpa?.subtotal || 0) + unitCalc.executionRpa,
      executionRpaGroups,
      defaultDutyDays,
      executionRpaLines,
      true,
    ),
    executionOm: buildProjectionCell(
      (unitCalc.whiteCellOm?.subtotal || 0) + unitCalc.executionOm,
      executionOmGroups,
      defaultDutyDays,
      executionOmLines,
      true,
    ),
  };
}

function Pm27UnitProjectionTables() {
  const { exercise, budget } = useApp();

  if (!exercise || !budget) return null;

  const units = Object.values(budget.units).sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode));
  const unitBudgetsByCode = new Map(
    (exercise.unitBudgets || []).map((unitBudget) => [String(unitBudget.unitCode || '').toUpperCase(), unitBudget]),
  );

  const columns = [
    { title: 'Planning RPA', dataIndex: 'planningRpa', key: 'planningRpa', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Planning O&M', dataIndex: 'planningOm', key: 'planningOm', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Player RPA', dataIndex: 'playerRpa', key: 'playerRpa', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Player O&M', dataIndex: 'playerOm', key: 'playerOm', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Execution RPA', dataIndex: 'executionRpa', key: 'executionRpa', width: 260, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Execution O&M', dataIndex: 'executionOm', key: 'executionOm', width: 260, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      {units.map((unit) => (
        <Card
          key={unit.unitCode}
          title={getUnitDisplayLabel(unit.unitCode)}
          className="ct-section-card"
          style={{ marginBottom: 16 }}
        >
          <div className="ct-table">
            <Table
              size="small"
              pagination={false}
              columns={columns}
              scroll={{ x: 1480 }}
              dataSource={[
                buildProjectionRow(
                  unitBudgetsByCode.get(String(unit.unitCode || '').toUpperCase()),
                  unit,
                  exercise.defaultDutyDays || 1,
                ),
              ]}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function Pm27CostProjections() {
  return (
    <ReportsPage
      title="PM 27 Cost Projections"
      extraSections={<Pm27UnitProjectionTables />}
    />
  );
}
