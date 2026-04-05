import { Card, Table, Typography } from 'antd';
import { useApp } from '../components/AppLayout';
import BudgetOverviewSection from '../components/BudgetOverviewSection';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { ReportsPage } from './Reports';
import type { ExecutionCostLine, FundingType, GroupCalc, PersonnelEntry, PersonnelGroup, UnitBudget, UnitCalc } from '../types';

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
  breakdowns: Array<{ label: string; amount: number }>;
  details: string[];
};

type ProjectionRow = {
  key: string;
  planningRpa: ProjectionCell;
  planningOm: ProjectionCell;
  playerRpa: ProjectionCell;
  annualTourRpa: ProjectionCell;
  playerOm: ProjectionCell;
  executionRpa: ProjectionCell;
  executionOm: ProjectionCell;
};

type ProjectionFieldKey =
  | 'planningRpa'
  | 'planningOm'
  | 'playerRpa'
  | 'annualTourRpa'
  | 'playerOm'
  | 'executionRpa'
  | 'executionOm';

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
  breakdowns: Array<{ label: string; amount: number }> = [],
): ProjectionCell {
  return {
    total,
    breakdowns,
    details: [
      ...getPersonnelDetails(personnelGroups, defaultDutyDays, includeRolePrefix),
      ...getExecutionLineDetails(executionLines),
    ],
  };
}

function buildRpaBreakdowns(
  group: GroupCalc | undefined,
  options?: {
    includeMeals?: boolean;
    extraItems?: Array<{ label: string; amount: number }>;
    labelPrefix?: string;
    excludeBilleting?: boolean;
  },
): Array<{ label: string; amount: number }> {
  const milPay = group?.milPay || 0;
  const travel = (group?.travel || 0) + (group?.perDiem || 0) + (options?.excludeBilleting ? 0 : (group?.billeting || 0));
  const labelPrefix = options?.labelPrefix || 'RPA';
  const breakdowns = [
    { label: `${labelPrefix} Mil Pay`, amount: milPay },
    { label: `${labelPrefix} Travel & Per Diem`, amount: travel },
  ];

  if (options?.includeMeals && (group?.meals || 0) > 0) {
    breakdowns.push({ label: `${labelPrefix} Meals`, amount: group?.meals || 0 });
  }

  for (const item of options?.extraItems || []) {
    if ((item.amount || 0) > 0) {
      breakdowns.push(item);
    }
  }

  return breakdowns;
}

function renderProjectionCell(value: ProjectionCell) {
  return (
    <div style={{ minHeight: 92 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {fmt(value.total)}
      </Typography.Text>
      {value.breakdowns.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: value.details.length > 0 ? 8 : 0 }}>
          {value.breakdowns.map((breakdown) => (
            <Typography.Text key={`${breakdown.label}-${breakdown.amount}`} style={{ fontSize: 12, lineHeight: 1.35, color: '#596577' }}>
              {breakdown.label}: {fmt(breakdown.amount)}
            </Typography.Text>
          ))}
        </div>
      ) : null}
      {value.details.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.details.map((detail) => (
            <Typography.Text key={detail} style={{ fontSize: 12, lineHeight: 1.4 }}>
              {detail}
            </Typography.Text>
          ))}
        </div>
      ) : value.breakdowns.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          No entries yet
        </Typography.Text>
      ) : null}
    </div>
  );
}

const projectionSections: Array<{ key: ProjectionFieldKey; label: string }> = [
  { key: 'planningRpa', label: 'Planning RPA' },
  { key: 'planningOm', label: 'Planning O&M' },
  { key: 'playerRpa', label: 'Player RPA' },
  { key: 'annualTourRpa', label: 'Annual Tour' },
  { key: 'playerOm', label: 'Player O&M' },
  { key: 'executionRpa', label: 'Execution RPA' },
  { key: 'executionOm', label: 'Execution O&M' },
];

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
  const annualTourRpaGroups = findGroups(unitBudget, 'ANNUAL_TOUR', 'RPA');
  const playerOmGroups = findGroups(unitBudget, 'PLAYER', 'OM');
  const executionRpaGroups = findExecutionGroups(unitBudget, 'RPA');
  const executionOmGroups = findExecutionGroups(unitBudget, 'OM');
  const playerMeals = unitCalc.playerRpa.meals || 0;
  const derivedExecutionRpaLines = playerMeals > 0
    ? [{
        id: '__derived_player_meals__',
        unitBudgetId: unitBudget?.id || '',
        fundingType: 'RPA' as FundingType,
        category: 'Player Meals',
        amount: playerMeals,
        notes: 'Auto-populated from Player - Execution (RPA) meals',
      }]
    : [];
  const executionRpaLines = [...derivedExecutionRpaLines, ...findExecutionLines(unitBudget, 'RPA')];
  const executionOmLines = findExecutionLines(unitBudget, 'OM');
  const playerBilletingOm = unitCalc.playerRpa?.billeting || 0;
  const annualTourBilletingOm = unitCalc.annualTourRpa?.billeting || 0;

  return {
    key: unitCalc.unitCode,
    planningRpa: buildProjectionCell(
      unitCalc.planningRpa.subtotal,
      planningRpaGroups,
      defaultDutyDays,
      [],
      false,
      buildRpaBreakdowns(unitCalc.planningRpa),
    ),
    planningOm: buildProjectionCell(unitCalc.planningOm.subtotal, planningOmGroups, defaultDutyDays),
    playerRpa: buildProjectionCell(
      Math.max(0, unitCalc.playerRpa.subtotal - playerMeals),
      playerRpaGroups,
      defaultDutyDays,
      [],
      false,
      buildRpaBreakdowns(unitCalc.playerRpa, { excludeBilleting: true }),
    ),
    annualTourRpa: buildProjectionCell(
      unitCalc.annualTourRpa?.subtotal || 0,
      annualTourRpaGroups,
      defaultDutyDays,
      [],
      false,
      buildRpaBreakdowns(unitCalc.annualTourRpa, { includeMeals: true, labelPrefix: 'AT', excludeBilleting: true }),
    ),
    playerOm: buildProjectionCell(
      unitCalc.playerOm.subtotal,
      playerOmGroups,
      defaultDutyDays,
      [],
      false,
      [
        ...(playerBilletingOm > 0 ? [{ label: 'Player Billeting (O&M)', amount: playerBilletingOm }] : []),
        ...(annualTourBilletingOm > 0 ? [{ label: 'AT Billeting (O&M)', amount: annualTourBilletingOm }] : []),
      ],
    ),
    executionRpa: buildProjectionCell(
      (unitCalc.whiteCellRpa?.subtotal || 0) + unitCalc.executionRpa + playerMeals,
      executionRpaGroups,
      defaultDutyDays,
      executionRpaLines,
      true,
      buildRpaBreakdowns(unitCalc.whiteCellRpa, {
        extraItems: [
          { label: 'RPA Meals', amount: playerMeals },
          { label: 'Execution Costs', amount: unitCalc.executionRpa },
        ],
      }),
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

function A7RpaFundingSummary() {
  const { budget } = useApp();

  if (!budget) return null;

  const planningRpaTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningRpa?.subtotal || 0), 0);
  const playerRpaTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + Math.max(0, (unit.playerRpa?.subtotal || 0) - (unit.playerRpa?.meals || 0)), 0);
  const annualTourTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.annualTourRpa?.subtotal || 0), 0);
  const executionRpaTotal = Object.values(budget.units)
    .reduce(
      (sum, unit) => sum + (unit.whiteCellRpa?.subtotal || 0) + (unit.executionRpa || 0) + (unit.playerRpa?.meals || 0),
      0,
    );

  const summaryItems = [
    { label: 'Planning RPA', value: planningRpaTotal },
    { label: 'Player RPA', value: playerRpaTotal },
    { label: 'Annual Tour (incl. meals)', value: annualTourTotal },
    { label: 'Execution RPA', value: executionRpaTotal },
  ];

  return (
    <Card title="A7 RPA Funding Responsibility" className="ct-section-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Exercise-Wide RPA Paid By A7
            </Typography.Text>
            <Typography.Title level={2} style={{ margin: '4px 0 0', color: '#1677ff' }}>
              {fmt(budget.totalRpa)}
            </Typography.Title>
          </div>
          <Typography.Text type="secondary" style={{ maxWidth: 560, textAlign: 'right' }}>
            Projection note: unit rows still show where costs occur, but A7 is the paying office for the full exercise RPA requirement.
          </Typography.Text>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {summaryItems.map((item) => (
            <div
              key={item.label}
              style={{
                border: '1px solid #e8ecf1',
                borderRadius: 12,
                padding: '12px 14px',
                background: '#fafcff',
              }}
            >
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                {item.label}
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 20, color: '#1a1a2e' }}>
                {fmt(item.value)}
              </Typography.Text>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
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
    { title: 'Annual Tour', dataIndex: 'annualTourRpa', key: 'annualTourRpa', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Player O&M', dataIndex: 'playerOm', key: 'playerOm', width: 240, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Execution RPA', dataIndex: 'executionRpa', key: 'executionRpa', width: 260, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
    { title: 'Execution O&M', dataIndex: 'executionOm', key: 'executionOm', width: 260, render: renderProjectionCell, onCell: () => ({ style: { verticalAlign: 'top' } }) },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      {units.map((unit) => {
        const projectionRow = buildProjectionRow(
          unitBudgetsByCode.get(String(unit.unitCode || '').toUpperCase()),
          unit,
          exercise.defaultDutyDays || 1,
        );

        return (
          <Card
            key={unit.unitCode}
            title={getUnitDisplayLabel(unit.unitCode)}
            className="ct-section-card"
            style={{ marginBottom: 16 }}
          >
            <div className="ct-table ct-screen-only">
              <Table
                size="small"
                pagination={false}
                columns={columns}
                scroll={{ x: 1720 }}
                dataSource={[projectionRow]}
              />
            </div>
            <div className="ct-print-only ct-pm27-print-grid">
              {projectionSections.map((section) => {
                const cell = projectionRow[section.key];
                return (
                  <div key={section.key} className="ct-pm27-print-item">
                    <div className="ct-pm27-print-item-header">
                      <div className="ct-pm27-print-item-label">{section.label}</div>
                      <div className="ct-pm27-print-item-total">{fmt(cell.total)}</div>
                    </div>
                    {cell.breakdowns.length > 0 ? (
                      <div className="ct-pm27-print-item-details">
                        {cell.breakdowns.map((breakdown) => (
                          <div key={`${breakdown.label}-${breakdown.amount}`} className="ct-pm27-print-item-detail">
                            {breakdown.label}: {fmt(breakdown.amount)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {cell.details.length > 0 ? (
                      <div className="ct-pm27-print-item-details">
                        {cell.details.map((detail) => (
                          <div key={detail} className="ct-pm27-print-item-detail">
                            {detail}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="ct-pm27-print-item-empty">No entries yet</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function Pm27CostProjections() {
  return (
    <ReportsPage
      title="PM 27 Cost Projections"
      showBudgetDetails={false}
      showGrandTotals={false}
      beforeBudgetBreakdownSection={<BudgetOverviewSection />}
      extraSections={(
        <>
          <A7RpaFundingSummary />
          <Pm27UnitProjectionTables />
        </>
      )}
    />
  );
}
