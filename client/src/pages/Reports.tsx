import { Card, Typography, Button, Row, Col, Table, Descriptions, Space, Spin, InputNumber, Form, message } from 'antd';
import { FileExcelOutlined, PrinterOutlined, EditOutlined, SaveOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import dayjs from 'dayjs';
import { exportElementToPdf } from '../services/pdf';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

interface ReportsPageProps {
  title?: string;
  extraSections?: ReactNode;
}

export function ReportsPage({ title = 'Reports & Export', extraSections }: ReportsPageProps) {
  const { exercise, budget, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const [editTravel, setEditTravel] = useState(false);
  const [travelForm] = Form.useForm();
  const { data: appConfig = {} } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });
  const exportRef = useRef<HTMLDivElement>(null);
  const travelAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dutyDaysAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const travelDraft = Form.useWatch([], travelForm);
  const [draftRpaBudgetTarget, setDraftRpaBudgetTarget] = useState(0);
  const [draftOmBudgetTarget, setDraftOmBudgetTarget] = useState(0);
  const [draftDutyDays, setDraftDutyDays] = useState(1);
  const skipBudgetTargetsSaveRef = useRef(true);
  const skipTotalBudgetSaveRef = useRef(true);
  const skipDutyDaysSaveRef = useRef(true);

  const travelMut = useMutation({
    mutationFn: (data: any) => api.updateTravelConfig(exerciseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
    },
  });

  const exerciseMut = useMutation({
    mutationFn: (data: any) => api.updateExercise(exerciseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      message.success('Exercise updated');
    },
  });

  const totalBudgetMut = useMutation({
    mutationFn: (totalBudget: number) => api.updateExercise(exerciseId!, { totalBudget }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
    },
  });

  const appConfigMut = useMutation({
    mutationFn: (config: Record<string, string>) => api.updateAppConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appConfig'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      message.success('Budget targets updated');
    },
  });

  if (!exercise || !budget) return <div className="ct-loading"><Spin size="large" /></div>;

  const handleExport = () => api.exportExcel(exerciseId!);
  const handlePrint = () => window.print();
  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    try {
      await exportElementToPdf(`${exercise.name} ${title}`, exportRef.current);
    } catch (error: any) {
      message.error(error?.message || 'Unable to export reports to PDF');
    }
  };

  const travel = exercise.travelConfig;

  useEffect(() => {
    if (!editTravel || !travelDraft || travelMut.isPending) return;
    const nextValues = {
      airfarePerPerson: Number(travelDraft.airfarePerPerson ?? travel?.airfarePerPerson ?? 400),
      rentalCarDailyRate: Number(travelDraft.rentalCarDailyRate ?? travel?.rentalCarDailyRate ?? 50),
      rentalCarCount: Number(travelDraft.rentalCarCount ?? travel?.rentalCarCount ?? 0),
      rentalCarDays: Number(travelDraft.rentalCarDays ?? travel?.rentalCarDays ?? 0),
    };
    const currentValues = {
      airfarePerPerson: Number(travel?.airfarePerPerson ?? 400),
      rentalCarDailyRate: Number(travel?.rentalCarDailyRate ?? 50),
      rentalCarCount: Number(travel?.rentalCarCount ?? 0),
      rentalCarDays: Number(travel?.rentalCarDays ?? 0),
    };
    const hasChanges = Object.keys(nextValues).some((key) => nextValues[key as keyof typeof nextValues] !== currentValues[key as keyof typeof currentValues]);
    if (!hasChanges) return;

    if (travelAutoSaveTimer.current) clearTimeout(travelAutoSaveTimer.current);
    travelAutoSaveTimer.current = setTimeout(() => {
      travelMut.mutate(nextValues);
    }, 700);

    return () => {
      if (travelAutoSaveTimer.current) clearTimeout(travelAutoSaveTimer.current);
    };
  }, [editTravel, travelDraft, travel, travelMut.isPending]);

  const unitData = Object.values(budget.units)
    .sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode))
    .map((u) => ({
      key: u.unitCode,
      unit: getUnitDisplayLabel(u.unitCode),
      wcRpa: u.whiteCellRpa.subtotal,
      wcOm: u.whiteCellOm.subtotal,
      playerRpa: u.playerRpa.subtotal,
      playerOm: u.playerOm.subtotal,
      execRpa: u.executionRpa,
      execOm: u.executionOm,
      totalRpa: u.unitTotalRpa,
      totalOm: u.unitTotalOm,
      total: u.unitTotal,
    }));

  const columns = [
    { title: 'Unit', dataIndex: 'unit', width: 60 },
    { title: 'White Cell RPA', dataIndex: 'wcRpa', render: fmt },
    { title: 'White Cell O&M', dataIndex: 'wcOm', render: fmt },
    { title: 'Player RPA', dataIndex: 'playerRpa', render: fmt },
    { title: 'Player O&M', dataIndex: 'playerOm', render: fmt },
    { title: 'Execution RPA', dataIndex: 'execRpa', render: fmt },
    { title: 'Execution O&M', dataIndex: 'execOm', render: fmt },
    { title: 'Total RPA', dataIndex: 'totalRpa', render: fmt },
    { title: 'Total O&M', dataIndex: 'totalOm', render: fmt },
    { title: 'Total', dataIndex: 'total', render: (v: number) => <strong>{fmt(v)}</strong> },
  ];

  const totalBudgetLeft = (exercise.totalBudget || 0) - budget.grandTotal;
  const cfgNum = (key: string) => Number(appConfig[key] || 0);
  const rpaBudgetTarget = cfgNum('BUDGET_TARGET_RPA');
  const omBudgetTarget = cfgNum('BUDGET_TARGET_OM');
  const draftOverallBudget = draftRpaBudgetTarget + draftOmBudgetTarget;

  useEffect(() => {
    skipBudgetTargetsSaveRef.current = true;
    skipTotalBudgetSaveRef.current = true;
    setDraftRpaBudgetTarget(rpaBudgetTarget);
    setDraftOmBudgetTarget(omBudgetTarget);
  }, [rpaBudgetTarget, omBudgetTarget]);

  useEffect(() => {
    skipDutyDaysSaveRef.current = true;
    setDraftDutyDays(exercise.defaultDutyDays);
  }, [exercise.defaultDutyDays]);

  useEffect(() => {
    if (skipBudgetTargetsSaveRef.current) {
      skipBudgetTargetsSaveRef.current = false;
      return;
    }
    if (appConfigMut.isPending) return;
    if (draftRpaBudgetTarget === rpaBudgetTarget && draftOmBudgetTarget === omBudgetTarget) return;

    if (budgetAutoSaveTimer.current) clearTimeout(budgetAutoSaveTimer.current);
    budgetAutoSaveTimer.current = setTimeout(() => {
      appConfigMut.mutate({
        ...appConfig,
        BUDGET_TARGET_RPA: String(draftRpaBudgetTarget),
        BUDGET_TARGET_OM: String(draftOmBudgetTarget),
      });
    }, 700);

    return () => {
      if (budgetAutoSaveTimer.current) clearTimeout(budgetAutoSaveTimer.current);
    };
  }, [
    appConfig,
    appConfigMut,
    draftRpaBudgetTarget,
    draftOmBudgetTarget,
    rpaBudgetTarget,
    omBudgetTarget,
  ]);

  useEffect(() => {
    if (skipTotalBudgetSaveRef.current) {
      skipTotalBudgetSaveRef.current = false;
      return;
    }
    if (totalBudgetMut.isPending) return;
    if (draftOverallBudget === exercise.totalBudget) return;
    totalBudgetMut.mutate(draftOverallBudget);
  }, [draftOverallBudget, exercise.totalBudget, totalBudgetMut]);

  useEffect(() => {
    if (skipDutyDaysSaveRef.current) {
      skipDutyDaysSaveRef.current = false;
      return;
    }
    if (exerciseMut.isPending) return;
    if (draftDutyDays === exercise.defaultDutyDays) return;

    if (dutyDaysAutoSaveTimer.current) clearTimeout(dutyDaysAutoSaveTimer.current);
    dutyDaysAutoSaveTimer.current = setTimeout(() => {
      exerciseMut.mutate({ defaultDutyDays: draftDutyDays });
    }, 700);

    return () => {
      if (dutyDaysAutoSaveTimer.current) clearTimeout(dutyDaysAutoSaveTimer.current);
    };
  }, [draftDutyDays, exercise.defaultDutyDays, exerciseMut]);

  return (
    <div ref={exportRef}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Typography.Title level={4} className="ct-page-title" style={{ marginBottom: 0 }}>{title}</Typography.Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<FilePdfOutlined />} onClick={handleExportPdf}>Export to PDF</Button>
            <Button icon={<FileExcelOutlined />} type="primary" onClick={handleExport}>Export to Excel</Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          </Space>
        </Col>
      </Row>

      {/* Exercise info */}
      <Card
        title="Exercise Details"
        className="ct-section-card"
        style={{ marginBottom: 24 }}
        extra={
          <Typography.Text type="secondary">
            {appConfigMut.isPending || totalBudgetMut.isPending || exerciseMut.isPending ? 'Autosaving...' : 'Changes auto-save'}
          </Typography.Text>
        }
      >
        <Descriptions column={4} size="small">
          <Descriptions.Item label="Name">{exercise.name}</Descriptions.Item>
          <Descriptions.Item label="Start">{dayjs(exercise.startDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="End">{dayjs(exercise.endDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Total Budget ($)">
            <Space direction="vertical" size={10} style={{ width: '100%', maxWidth: 320 }}>
              <InputNumber
                size="small"
                min={0}
                value={draftOverallBudget}
                addonBefore="Overall Budget"
                style={{ width: '100%' }}
                readOnly
              />
              <InputNumber
                size="small"
                min={0}
                value={draftRpaBudgetTarget}
                onChange={(v) => setDraftRpaBudgetTarget(v ?? 0)}
                addonBefore="RPA Budget"
                style={{ width: '100%' }}
              />
              <InputNumber
                size="small"
                min={0}
                value={draftOmBudgetTarget}
                onChange={(v) => setDraftOmBudgetTarget(v ?? 0)}
                addonBefore="O&M Budget"
                style={{ width: '100%' }}
              />
            </Space>
          </Descriptions.Item>
              <Descriptions.Item label="Exercise Duration">
            <InputNumber
              size="small"
              min={1}
              value={draftDutyDays}
              onChange={(v) => setDraftDutyDays(v ?? 1)}
              style={{ width: 70 }}
            />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Full budget table */}
      <Card title="Full Budget Breakdown" className="ct-section-card" style={{ marginBottom: 24 }}>
        <div className="ct-table">
          <Table size="small" pagination={false} dataSource={unitData} columns={columns} scroll={{ x: 1100 }} />
        </div>
      </Card>

      {extraSections}

      {/* Travel Config */}
      <Card
        title="Travel Configuration"
        className="ct-section-card"
        style={{ marginBottom: 24 }}
        extra={
          editTravel ? (
            <Space>
              <Typography.Text type="secondary">{travelMut.isPending ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>
              <Button icon={<SaveOutlined />} onClick={() => setEditTravel(false)}>
                Done
              </Button>
            </Space>
          ) : (
            <Button icon={<EditOutlined />} onClick={() => { setEditTravel(true); if (travel) travelForm.setFieldsValue(travel); }}>
              Edit
            </Button>
          )
        }
      >
        {editTravel ? (
          <Form form={travelForm} layout="inline" initialValues={travel || {}}>
            <Form.Item name="airfarePerPerson" label="Airfare ($/person)">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="rentalCarDailyRate" label="Rental Car ($/day)">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="rentalCarCount" label="# Cars">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="rentalCarDays" label="# Days">
              <InputNumber min={0} />
            </Form.Item>
          </Form>
        ) : (
          <Descriptions column={4} size="small">
            <Descriptions.Item label="Airfare">{fmt(travel?.airfarePerPerson || 400)}/person</Descriptions.Item>
            <Descriptions.Item label="Rental Cars">{travel?.rentalCarCount || 0} vehicles</Descriptions.Item>
            <Descriptions.Item label="Car Rate">{fmt(travel?.rentalCarDailyRate || 50)}/day</Descriptions.Item>
            <Descriptions.Item label="Car Days">{travel?.rentalCarDays || 0} days</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* Grand totals */}
      <Card title="Grand Totals" className="ct-section-card">
        <Descriptions column={3}>
          <Descriptions.Item label="Total Budget Left"><Typography.Text strong>{fmt(totalBudgetLeft)}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="Total RPA"><Typography.Text strong style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="Total O&M"><Typography.Text strong style={{ color: '#52c41a' }}>{fmt(budget.totalOm)}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="Grand Total"><Typography.Title level={4} style={{ margin: 0 }}>{fmt(budget.grandTotal)}</Typography.Title></Descriptions.Item>
          <Descriptions.Item label="RPA Travel">{fmt(budget.rpaTravel)}</Descriptions.Item>
          <Descriptions.Item label="Exercise O&M">{fmt(budget.exerciseOmTotal)}</Descriptions.Item>
          <Descriptions.Item label="WRM">{fmt(budget.wrm)}</Descriptions.Item>
          <Descriptions.Item label="Total PAX">{budget.totalPax}</Descriptions.Item>
          <Descriptions.Item label="Players">{budget.totalPlayers}</Descriptions.Item>
          <Descriptions.Item label="White Cell">{budget.totalWhiteCell}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}

export default function Reports() {
  return <ReportsPage />;
}
