import { Card, Table, Typography } from 'antd';
import { useApp } from '../components/AppLayout';
import type { PersonnelEntry, PersonnelGroup } from '../types';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { ReportsPage } from './Reports';

type SustainmentRow = {
  key: string;
  unit: string;
  mresNeeded: number;
  playerRoomsNeeded: number;
  playerRoomNights: number;
  localHotelRoomsNeeded: number;
  localHotelRoomNights: number;
};

function toCount(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function toLocalFlag(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'local';
  }
  return false;
}

function getEffectiveEntries(group: PersonnelGroup, defaultDutyDays: number): Array<Partial<PersonnelEntry>> {
  if (group.personnelEntries.length > 0) {
    return group.personnelEntries;
  }

  if ((group.paxCount || 0) <= 0) {
    return [];
  }

  return [{
    count: group.paxCount,
    dutyDays: group.dutyDays ?? defaultDutyDays,
    isLocal: group.isLocal,
  }];
}

function buildSustainmentRow(groupList: PersonnelGroup[], unitCode: string, defaultDutyDays: number): SustainmentRow {
  const row: SustainmentRow = {
    key: unitCode,
    unit: getUnitDisplayLabel(unitCode),
    mresNeeded: 0,
    playerRoomsNeeded: 0,
    playerRoomNights: 0,
    localHotelRoomsNeeded: 0,
    localHotelRoomNights: 0,
  };

  for (const group of groupList) {
    const role = String(group.role || '').toUpperCase();
    const isPlayerLike = role === 'PLAYER' || role === 'ANNUAL_TOUR';
    const isExecutionHotelGroup = role === 'WHITE_CELL' || role === 'SUPPORT';
    const isRpaPlayerMealsGroup = isPlayerLike && String(group.fundingType || '').toUpperCase() === 'RPA';

    for (const entry of getEffectiveEntries(group, defaultDutyDays)) {
      const count = toCount(entry.count);
      const dutyDays = toCount(entry.dutyDays ?? group.dutyDays ?? defaultDutyDays);
      const isLocal = toLocalFlag(entry.isLocal) || toLocalFlag(group.isLocal);

      if (count <= 0 || dutyDays <= 0) continue;

      if (isRpaPlayerMealsGroup) {
        row.mresNeeded += count * dutyDays;
      }

      if (isPlayerLike && !isLocal) {
        row.playerRoomsNeeded += count;
        row.playerRoomNights += count * dutyDays;
      }

      if (isExecutionHotelGroup && !isLocal) {
        row.localHotelRoomsNeeded += count;
        row.localHotelRoomNights += count * dutyDays;
      }
    }
  }

  return row;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function SustainmentWorkspace() {
  const { exercise } = useApp();

  if (!exercise) return null;

  const sustainmentRows = [...(exercise.unitBudgets || [])]
    .sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode))
    .map((unitBudget) => buildSustainmentRow(unitBudget.personnelGroups || [], unitBudget.unitCode, exercise.defaultDutyDays || 1));

  const totals = sustainmentRows.reduce(
    (acc, row) => ({
      mresNeeded: acc.mresNeeded + row.mresNeeded,
      playerRoomsNeeded: acc.playerRoomsNeeded + row.playerRoomsNeeded,
      playerRoomNights: acc.playerRoomNights + row.playerRoomNights,
      localHotelRoomsNeeded: acc.localHotelRoomsNeeded + row.localHotelRoomsNeeded,
      localHotelRoomNights: acc.localHotelRoomNights + row.localHotelRoomNights,
    }),
    {
      mresNeeded: 0,
      playerRoomsNeeded: 0,
      playerRoomNights: 0,
      localHotelRoomsNeeded: 0,
      localHotelRoomNights: 0,
    },
  );

  const summaryCards = [
    {
      key: 'mres',
      title: "MRE's",
      value: formatQuantity(totals.mresNeeded),
      note: '1 lunch/MRE per RPA player or annual-tour pax day',
    },
    {
      key: 'a-rations',
      title: 'A rations',
      value: '',
      note: '',
    },
    {
      key: 'player-rooms',
      title: 'Player billeting rooms needed (Assuming 1 PAX per room)',
      value: formatQuantity(totals.playerRoomsNeeded),
      note: `${formatQuantity(totals.playerRoomNights)} total room nights`,
    },
    {
      key: 'hotel-rooms',
      title: 'Local hotel rooms needed',
      value: formatQuantity(totals.localHotelRoomsNeeded),
      note: `${formatQuantity(totals.localHotelRoomNights)} total room nights`,
    },
  ];

  const columns = [
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: "MRE's",
      dataIndex: 'mresNeeded',
      key: 'mresNeeded',
      align: 'right' as const,
      render: (value: number) => formatQuantity(value),
    },
    {
      title: 'Player Rooms',
      dataIndex: 'playerRoomsNeeded',
      key: 'playerRoomsNeeded',
      align: 'right' as const,
      render: (value: number) => formatQuantity(value),
    },
    {
      title: 'Player Room Nights',
      dataIndex: 'playerRoomNights',
      key: 'playerRoomNights',
      align: 'right' as const,
      render: (value: number) => formatQuantity(value),
    },
    {
      title: 'Local Hotel Rooms',
      dataIndex: 'localHotelRoomsNeeded',
      key: 'localHotelRoomsNeeded',
      align: 'right' as const,
      render: (value: number) => formatQuantity(value),
    },
    {
      title: 'Local Hotel Room Nights',
      dataIndex: 'localHotelRoomNights',
      key: 'localHotelRoomNights',
      align: 'right' as const,
      render: (value: number) => formatQuantity(value),
    },
  ];

  return (
    <>
      <Card className="ct-section-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {summaryCards.map((item) => (
            <div
              key={item.key}
              style={{
                border: '1px solid #d9e3f0',
                borderRadius: 16,
                padding: '18px 20px',
                background: '#fbfdff',
              }}
            >
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                {item.title}
              </Typography.Text>
              <Typography.Title level={2} style={{ margin: 0, color: '#1f2f4a', minHeight: 44 }}>
                {item.value}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, minHeight: 22 }}>
                {item.note}
              </Typography.Text>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Sustainment Breakdown by Unit"
        className="ct-section-card"
        extra={(
          <Typography.Text type="secondary">
            Rooms assume one room per non-local traveler.
          </Typography.Text>
        )}
      >
        <div className="ct-table">
          <Table
            size="small"
            pagination={false}
            dataSource={sustainmentRows}
            columns={columns}
            scroll={{ x: 960 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><strong>Total</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><strong>{formatQuantity(totals.mresNeeded)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><strong>{formatQuantity(totals.playerRoomsNeeded)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><strong>{formatQuantity(totals.playerRoomNights)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><strong>{formatQuantity(totals.localHotelRoomsNeeded)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><strong>{formatQuantity(totals.localHotelRoomNights)}</strong></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      </Card>
    </>
  );
}

export default function Sustainment() {
  return (
    <ReportsPage
      title="Exercise Sustainment"
      showBudgetDetails={false}
      showGrandTotals={false}
      showExerciseDetails={false}
      showQuickPlanningSummary={false}
      showFullBudgetBreakdown={false}
      showTravelConfiguration={false}
      extraSections={<SustainmentWorkspace />}
    />
  );
}
