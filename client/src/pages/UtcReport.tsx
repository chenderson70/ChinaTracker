import { Button, Card, Input, Space, Table, Typography, message } from 'antd';
import { FileExcelOutlined, FilePdfOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import * as XLSX from 'xlsx';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import { exportElementToPdf } from '../services/pdf';
import type { ExerciseDetail, FundingType, GroupCalc, PersonnelGroup, UnitCalc } from '../types';
import { getUnitDisplayLabel } from '../utils/unitLabels';
import { getUtcAlignmentLabel, getUtcDisplayTitle, getUtcTemplateByCode, type UtcAlignment } from '../utils/utcTemplates';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const filenameSafe = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'UTC_Report';

type UtcReportRow = {
  key: string;
  utcCode: string;
  utcTitle: string;
  alignment: UtcAlignment;
  units: Set<string>;
  pax: number;
  rpaCost: number;
  omCost: number;
};

type UtcReportDisplayRow = Omit<UtcReportRow, 'units'> & {
  unitList: string;
  alignmentLabel: string;
  totalCost: number;
  costPerPax: number;
};

type UtcReportProps = {
  showHeader?: boolean;
};

type UtcSummaryCardProps = {
  title: string;
  count: number;
  tone: 'total' | 'sg' | 'ae';
};

type UtcMetricBubbleProps = {
  label: string;
  value: string;
  detail?: string;
  tone: 'cost' | 'per-pax';
};

function UtcMetricBubble({ label, value, detail, tone }: UtcMetricBubbleProps) {
  return (
    <div className={`ct-utc-metric-bubble ct-utc-metric-bubble-${tone}`}>
      <div className="ct-utc-metric-value">{value}</div>
      <div className="ct-utc-metric-label">{label}</div>
      {detail ? <div className="ct-utc-metric-detail">{detail}</div> : null}
    </div>
  );
}

function UtcSummaryCard({ title, count, tone }: UtcSummaryCardProps) {
  return (
    <div className={`ct-utc-summary-card ct-utc-summary-card-${tone}`}>
      <div className="ct-utc-summary-card-body">
        <div className="ct-utc-summary-count-bubble">{count}</div>
        <div className="ct-utc-summary-content">
          <Typography.Text className="ct-utc-summary-label">{title}</Typography.Text>
        </div>
      </div>
    </div>
  );
}

function getGroupCalc(unitCalc: UnitCalc | undefined, group: PersonnelGroup): GroupCalc | null {
  if (!unitCalc) return null;
  const role = String(group.role || '').toUpperCase();
  const funding = String(group.fundingType || '').toUpperCase() as FundingType;

  if (role === 'PLANNING' && funding === 'RPA') return unitCalc.planningRpa;
  if (role === 'PLANNING' && funding === 'OM') return unitCalc.planningOm;
  if ((role === 'WHITE_CELL' || role === 'SUPPORT') && funding === 'RPA') return unitCalc.whiteCellRpa;
  if ((role === 'WHITE_CELL' || role === 'SUPPORT') && funding === 'OM') return unitCalc.whiteCellOm;
  if (role === 'PLAYER' && funding === 'RPA') return unitCalc.playerRpa;
  if (role === 'PLAYER' && funding === 'OM') return unitCalc.playerOm;
  if (role === 'ANNUAL_TOUR' && funding === 'RPA') return unitCalc.annualTourRpa;
  return null;
}

export default function UtcReport({ showHeader = true }: UtcReportProps = {}) {
  const { exercise, budget, exerciseId, pushUndoSnapshot } = useApp();
  const queryClient = useQueryClient();
  const exportRef = useRef<HTMLDivElement>(null);
  const preparedByAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipPreparedBySaveRef = useRef(true);
  const [reportGeneratedOn, setReportGeneratedOn] = useState('');
  const [draftPreparedBy, setDraftPreparedBy] = useState('');
  const currentPreparedBy = String(exercise?.reportPreparedBy ?? '');
  const reportPreparedByDraftStorageKey = exerciseId ? `chinaTracker.utcReportPreparedByDraft.${exerciseId}` : null;

  const rows = (() => {
    if (!exercise || !budget) return [];
    const byUtc = new Map<string, UtcReportRow>();

    for (const unit of exercise.unitBudgets || []) {
      const unitCalc = budget.units?.[unit.unitCode];
      const unitLabel = getUnitDisplayLabel(unit.unitCode, unit.unitDisplayName);

      for (const group of unit.personnelGroups || []) {
        const taggedEntries = (group.personnelEntries || []).filter((entry) => entry.utcCode);
        if (taggedEntries.length === 0) continue;

        const totalGroupPax = (group.personnelEntries || []).reduce((sum, entry) => sum + Number(entry.count || 0), 0) || group.paxCount || 0;
        const groupCalc = getGroupCalc(unitCalc, group);
        const groupCost = Number(groupCalc?.subtotal || 0);

        for (const entry of taggedEntries) {
          const utcCode = String(entry.utcCode || '').trim().toUpperCase();
          if (!utcCode) continue;
          const template = getUtcTemplateByCode(utcCode);
          const alignment = template?.alignment ?? 'SG';

          const row = byUtc.get(utcCode) || {
            key: utcCode,
            utcCode,
            utcTitle: entry.utcTitle || '',
            alignment,
            units: new Set<string>(),
            pax: 0,
            rpaCost: 0,
            omCost: 0,
          };

          const pax = Number(entry.count || 0);
          const allocatedCost = totalGroupPax > 0 ? groupCost * (pax / totalGroupPax) : 0;
          row.utcTitle = row.utcTitle || entry.utcTitle || '';
          row.units.add(unitLabel);
          row.pax += pax;
          if (group.fundingType === 'RPA') row.rpaCost += allocatedCost;
          else row.omCost += allocatedCost;
          byUtc.set(utcCode, row);
        }
      }
    }

    return Array.from(byUtc.values())
      .map((row) => ({
        ...row,
        utcTitle: getUtcDisplayTitle(row.utcCode, row.utcTitle),
        unitList: Array.from(row.units).sort().join(', '),
        alignmentLabel: getUtcAlignmentLabel(row.alignment),
        totalCost: row.rpaCost + row.omCost,
        costPerPax: row.pax > 0 ? (row.rpaCost + row.omCost) / row.pax : 0,
      }))
      .sort((left, right) => left.alignment.localeCompare(right.alignment) || left.utcCode.localeCompare(right.utcCode));
  })();

  const totalPax = rows.reduce((sum, row) => sum + row.pax, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
  const sgRows = rows.filter((row) => row.alignment === 'SG');
  const aeRows = rows.filter((row) => row.alignment === 'AE');
  const preparedByForExport = draftPreparedBy.trim();
  const utcColumns = [
    { title: 'UTC', dataIndex: 'utcCode', width: 110 },
    { title: 'Description', dataIndex: 'utcTitle' },
    { title: 'Alignment', dataIndex: 'alignmentLabel', width: 110 },
    { title: 'Units', dataIndex: 'unitList' },
    { title: 'PAX', dataIndex: 'pax', align: 'right' as const, width: 90 },
    { title: 'RPA Cost', dataIndex: 'rpaCost', align: 'right' as const, render: fmt },
    { title: 'O&M Cost', dataIndex: 'omCost', align: 'right' as const, render: fmt },
    { title: 'Total Cost', dataIndex: 'totalCost', align: 'right' as const, render: fmt },
    { title: 'Cost / PAX', dataIndex: 'costPerPax', align: 'right' as const, render: fmt },
  ];

  const renderUtcTable = (dataSource: UtcReportDisplayRow[], emptyText: string) => {
    const sectionPax = dataSource.reduce((sum, row) => sum + row.pax, 0);
    const sectionRpaCost = dataSource.reduce((sum, row) => sum + row.rpaCost, 0);
    const sectionOmCost = dataSource.reduce((sum, row) => sum + row.omCost, 0);
    const sectionTotalCost = dataSource.reduce((sum, row) => sum + row.totalCost, 0);
    const sectionCostPerPax = sectionPax > 0 ? sectionTotalCost / sectionPax : 0;

    return (
      <div className="ct-table">
        <Table
          rowKey="key"
          dataSource={dataSource}
          pagination={false}
          locale={{ emptyText }}
          columns={utcColumns}
          summary={() => dataSource.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <strong>Total</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <strong>{sectionPax.toLocaleString('en-US')}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <strong>{fmt(sectionRpaCost)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">
                <strong>{fmt(sectionOmCost)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right">
                <strong>{fmt(sectionTotalCost)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="right">
                <strong>{fmt(sectionCostPerPax)}</strong>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null}
        />
      </div>
    );
  };

  const reportPreparedByMut = useMutation({
    mutationFn: async (data: Pick<ExerciseDetail, 'reportPreparedBy'>) => {
      await pushUndoSnapshot('Prepared By');
      return api.updateExercise(exerciseId!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  const stampReportGenerated = () => {
    const timestamp = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(new Date());

    flushSync(() => {
      setReportGeneratedOn(timestamp);
    });

    return timestamp;
  };

  const persistPreparedBy = (value: string) => {
    const nextPreparedBy = value.trim();
    const savedPreparedBy = currentPreparedBy.trim();
    if (!exerciseId || nextPreparedBy === savedPreparedBy || reportPreparedByMut.isPending) return;

    if (preparedByAutoSaveTimer.current) clearTimeout(preparedByAutoSaveTimer.current);
    reportPreparedByMut.mutate({ reportPreparedBy: nextPreparedBy });
  };

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    try {
      stampReportGenerated();
      await exportElementToPdf(`${exercise?.name || 'Exercise'} UTC Report`, exportRef.current);
    } catch (error: any) {
      message.error(error?.message || 'Unable to export UTC report to PDF');
    }
  };

  const handlePrint = () => {
    stampReportGenerated();
    window.print();
  };

  const handleExportExcel = () => {
    const generatedOn = stampReportGenerated();
    const workbook = XLSX.utils.book_new();
    const summaryRows = [
      ['UTC Report'],
      ['Exercise', exercise?.name || 'Current Exercise'],
      ['Report Generated', generatedOn],
      ['Prepared By', preparedByForExport],
      [],
      ['Total UTC Packages Tasked', rows.length],
      ['Tracked UTC PAX', totalPax],
      ['Tracked UTC Cost', totalCost],
      ['Cost / PAX', totalPax > 0 ? totalCost / totalPax : 0],
      [],
      ['UTC', 'Description', 'Alignment', 'Units', 'PAX', 'RPA Cost', 'O&M Cost', 'Total Cost', 'Cost / PAX'],
      ...rows.map((row) => [
        row.utcCode,
        row.utcTitle,
        row.alignmentLabel,
        row.unitList,
        row.pax,
        row.rpaCost,
        row.omCost,
        row.totalCost,
        row.costPerPax,
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(summaryRows);
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 34 },
      { wch: 12 },
      { wch: 28 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'UTC Report');
    const appendSectionSheet = (sheetName: string, sectionRows: UtcReportDisplayRow[]) => {
      const sectionWorksheet = XLSX.utils.json_to_sheet(sectionRows.map((row) => ({
        UTC: row.utcCode,
        Description: row.utcTitle,
        Alignment: row.alignmentLabel,
        Units: row.unitList,
        PAX: row.pax,
        'RPA Cost': row.rpaCost,
        'O&M Cost': row.omCost,
        'Total Cost': row.totalCost,
        'Cost / PAX': row.costPerPax,
      })));
      XLSX.utils.book_append_sheet(workbook, sectionWorksheet, sheetName);
    };
    appendSectionSheet('SG UTC Packages', sgRows);
    appendSectionSheet('AE UTC Packages', aeRows);
    XLSX.writeFile(workbook, `${filenameSafe(exercise?.name || 'Exercise')}_UTC_Report.xlsx`);
  };

  useEffect(() => {
    skipPreparedBySaveRef.current = true;
    if (!reportPreparedByDraftStorageKey) {
      setDraftPreparedBy(currentPreparedBy);
      return;
    }

    const storedDraft = localStorage.getItem(reportPreparedByDraftStorageKey);
    setDraftPreparedBy(storedDraft ?? currentPreparedBy);
  }, [currentPreparedBy, reportPreparedByDraftStorageKey]);

  useEffect(() => {
    if (!reportPreparedByDraftStorageKey) return;

    if (draftPreparedBy.trim() === currentPreparedBy.trim()) {
      localStorage.removeItem(reportPreparedByDraftStorageKey);
      return;
    }

    localStorage.setItem(reportPreparedByDraftStorageKey, draftPreparedBy);
  }, [currentPreparedBy, draftPreparedBy, reportPreparedByDraftStorageKey]);

  useEffect(() => {
    if (skipPreparedBySaveRef.current) {
      skipPreparedBySaveRef.current = false;
      return;
    }
    if (!exerciseId || reportPreparedByMut.isPending) return;

    const nextPreparedBy = draftPreparedBy.trim();
    const savedPreparedBy = currentPreparedBy.trim();
    if (nextPreparedBy === savedPreparedBy) return;

    if (preparedByAutoSaveTimer.current) clearTimeout(preparedByAutoSaveTimer.current);
    preparedByAutoSaveTimer.current = setTimeout(() => {
      reportPreparedByMut.mutate({ reportPreparedBy: nextPreparedBy });
    }, 300);

    return () => {
      if (preparedByAutoSaveTimer.current) clearTimeout(preparedByAutoSaveTimer.current);
    };
  }, [
    currentPreparedBy,
    draftPreparedBy,
    exerciseId,
    reportPreparedByMut,
  ]);

  return (
    <div ref={exportRef}>
      {showHeader ? (
        <div className="ct-page-header">
          <Typography.Title level={4} className="ct-page-title">UTC Report</Typography.Title>
          <div className="ct-page-actions">
            <Space wrap>
              <Button icon={<FilePdfOutlined />} onClick={handleExportPdf}>Export to PDF</Button>
              <Button icon={<FileExcelOutlined />} type="primary" onClick={handleExportExcel}>Export to Excel</Button>
              <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
            </Space>
          </div>
          <div className="ct-report-header-meta">
            <div className="ct-report-header-meta-row">
              <Typography.Text className="ct-report-header-meta-label">
                Report Generated:
              </Typography.Text>
              <Typography.Text className="ct-report-header-meta-value">
                {reportGeneratedOn}
              </Typography.Text>
            </div>
            <div className="ct-report-header-meta-row ct-report-header-prepared-by-row">
              <Typography.Text className="ct-report-header-meta-label">
                Prepared By
              </Typography.Text>
              <Input
                className="ct-screen-only ct-report-header-name-input"
                type="text"
                value={draftPreparedBy}
                onChange={(event) => setDraftPreparedBy(event.target.value)}
                onBlur={(event) => persistPreparedBy(event.target.value)}
                onPressEnter={(event) => {
                  persistPreparedBy((event.target as HTMLInputElement).value);
                  (event.target as HTMLInputElement).blur();
                }}
                aria-label="Prepared By"
                placeholder="Enter your name"
                maxLength={120}
                autoComplete="name"
              />
              <Typography.Text className="ct-print-only ct-report-header-meta-value">
                {preparedByForExport || '________________'}
              </Typography.Text>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="ct-section-card ct-utc-summary-shell" style={{ marginBottom: 16 }}>
        <div className="ct-utc-summary-header">
          <Typography.Text strong>{exercise?.name || 'Current Exercise'}</Typography.Text>
        </div>
        <div className="ct-utc-summary-grid">
          <UtcSummaryCard
            title="SG UTC Packages Tasked"
            count={sgRows.length}
            tone="sg"
          />
          <span className="ct-utc-summary-operator" aria-hidden="true">+</span>
          <UtcSummaryCard
            title="AE UTC Packages Tasked"
            count={aeRows.length}
            tone="ae"
          />
          <span className="ct-utc-summary-operator" aria-hidden="true">=</span>
          <UtcSummaryCard
            title="Total UTC Packages Tasked"
            count={rows.length}
            tone="total"
          />
        </div>
        <div className="ct-utc-metric-row" aria-label="UTC summary metrics">
          <UtcMetricBubble
            label="Total Tracked UTC Cost"
            value={fmt(totalCost)}
            tone="cost"
          />
          <UtcMetricBubble
            label="Cost / PAX"
            value={fmt(totalPax > 0 ? totalCost / totalPax : 0)}
            detail={`Total PAX: ${totalPax.toLocaleString('en-US')}`}
            tone="per-pax"
          />
        </div>
      </Card>

      <Card title="SG UTC Packages" className="ct-section-card" style={{ marginBottom: 16 }}>
        {renderUtcTable(sgRows, 'No SG UTC-tagged personnel rows yet. Use Add UTC from the SG unit.')}
      </Card>

      <Card title="AE UTC Packages" className="ct-section-card">
        {renderUtcTable(aeRows, 'No AE UTC-tagged personnel rows yet. Use Add UTC from the AE unit.')}
      </Card>
    </div>
  );
}
