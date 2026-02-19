import { useState, useEffect, createContext, useContext } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Select,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Typography,
  Statistic,
  Space,
  message,
} from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  SettingOutlined,
  DollarOutlined,
  FileExcelOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as api from '../services/api';
import type { ExerciseDetail, BudgetResult } from '../types';

const { Header, Sider, Content } = Layout;

interface AppCtx {
  exercise: ExerciseDetail | null;
  budget: BudgetResult | null;
  exerciseId: string | null;
  setExerciseId: (id: string) => void;
  refetchBudget: () => void;
  refetchExercise: () => void;
}
export const AppContext = createContext<AppCtx>({
  exercise: null,
  budget: null,
  exerciseId: null,
  setExerciseId: () => {},
  refetchBudget: () => {},
  refetchExercise: () => {},
});
export const useApp = () => useContext(AppContext);

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [exerciseId, setExerciseId] = useState<string | null>(localStorage.getItem('exerciseId'));
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  // Fetch exercise list
  const { data: exercises = [] } = useQuery({ queryKey: ['exercises'], queryFn: api.getExercises });

  // Fetch current exercise detail
  const { data: exercise = null, refetch: refetchExercise } = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => api.getExercise(exerciseId!),
    enabled: !!exerciseId,
  });

  // Fetch budget
  const { data: budget = null, refetch: refetchBudget } = useQuery({
    queryKey: ['budget', exerciseId],
    queryFn: () => api.calculateBudget(exerciseId!),
    enabled: !!exerciseId,
  });

  // Auto-select first exercise
  useEffect(() => {
    if (!exerciseId && exercises.length > 0) {
      setExerciseId(exercises[0].id);
    }
  }, [exercises, exerciseId]);

  useEffect(() => {
    if (exerciseId) localStorage.setItem('exerciseId', exerciseId);
  }, [exerciseId]);

  // Create exercise mutation
  const createMut = useMutation({
    mutationFn: api.createExercise,
    onSuccess: (ex) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      setExerciseId(ex.id);
      setCreateOpen(false);
      form.resetFields();
      message.success('Exercise created');
    },
  });

  const handleCreate = () => {
    form.validateFields().then((vals) => {
      createMut.mutate({
        name: vals.name,
        startDate: vals.dates[0].format('YYYY-MM-DD'),
        endDate: vals.dates[1].format('YYYY-MM-DD'),
        defaultDutyDays: vals.defaultDutyDays,
      });
    });
  };

  const fmt = (n: number | undefined) => '$' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    {
      key: 'units',
      icon: <TeamOutlined />,
      label: 'Units',
      children: [
        { key: '/units/SG', label: 'SG' },
        { key: '/units/AE', label: 'AE' },
        { key: '/units/CAB', label: 'CAB' },
        { key: '/units/A7', label: 'A7' },
      ],
    },
    { key: '/rates', icon: <SettingOutlined />, label: 'Rate Config' },
    { key: '/om-costs', icon: <DollarOutlined />, label: 'O&M Costs' },
    { key: '/reports', icon: <FileExcelOutlined />, label: 'Reports' },
  ];

  const selectedKey = location.pathname;

  return (
    <AppContext.Provider value={{ exercise, budget, exerciseId, setExerciseId, refetchBudget, refetchExercise }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider width={220} theme="dark" breakpoint="lg" collapsedWidth={60}>
          <div style={{ padding: '16px 16px 8px', textAlign: 'center' }}>
            <Typography.Title level={4} style={{ color: '#fff', margin: 0, fontSize: 16 }}>
              China Tracker
            </Typography.Title>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={['units']}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Layout>
          <Header
            style={{
              background: '#fff',
              padding: '0 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #f0f0f0',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <Space size="middle">
              <Select
                style={{ width: 260 }}
                placeholder="Select exercise"
                value={exerciseId}
                onChange={setExerciseId}
                options={exercises.map((e) => ({ value: e.id, label: e.name }))}
              />
              <Button icon={<PlusOutlined />} type="primary" onClick={() => setCreateOpen(true)}>
                New Exercise
              </Button>
            </Space>
            {budget && (
              <Space size="large">
                <Statistic title="Grand Total" value={fmt(budget.grandTotal)} valueStyle={{ fontSize: 18 }} />
                <Statistic title="RPA" value={fmt(budget.totalRpa)} valueStyle={{ fontSize: 14, color: '#1677ff' }} />
                <Statistic title="O&M" value={fmt(budget.totalOm)} valueStyle={{ fontSize: 14, color: '#52c41a' }} />
                <Statistic title="PAX" value={budget.totalPax} valueStyle={{ fontSize: 14 }} />
              </Space>
            )}
          </Header>
          <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8, overflow: 'auto' }}>
            {exerciseId ? <Outlet /> : <EmptyState onOpen={() => setCreateOpen(true)} />}
          </Content>
        </Layout>
      </Layout>

      {/* Create Exercise modal */}
      <Modal
        title="Create New Exercise"
        open={createOpen}
        onOk={handleCreate}
        confirmLoading={createMut.isPending}
        onCancel={() => setCreateOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Exercise Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., China Focus FY26 Spring" />
          </Form.Item>
          <Form.Item name="dates" label="Start / End Date" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="defaultDutyDays" label="Default Duty Days" initialValue={14}>
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </AppContext.Provider>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <Typography.Title level={3}>No Exercise Selected</Typography.Title>
      <Typography.Paragraph>Create a new exercise or select an existing one to begin tracking your budget.</Typography.Paragraph>
      <Button type="primary" icon={<PlusOutlined />} onClick={onOpen} size="large">
        Create Exercise
      </Button>
    </div>
  );
}
