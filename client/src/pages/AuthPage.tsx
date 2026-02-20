import { useState } from 'react';
import { Button, Card, Form, Input, Segmented, Space, Typography, message } from 'antd';
import { ThunderboltOutlined, LoginOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginForm] = Form.useForm();
  const [signupForm] = Form.useForm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (values: { username: string; password: string }) => api.loginAccount(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['authMe'] });
      message.success('Signed in successfully');
      navigate('/');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Login failed');
    },
  });

  const signupMutation = useMutation({
    mutationFn: (values: { username: string; password: string }) => api.registerAccount(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['authMe'] });
      message.success('Account created');
      navigate('/');
    },
    onError: (error: any) => {
      message.error(error?.message || 'Unable to create account');
    },
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(135deg, #0b1f42 0%, #132f63 100%)',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 460 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <ThunderboltOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <Typography.Title level={3} style={{ marginBottom: 0, marginTop: 8 }}>
              China Tracker
            </Typography.Title>
            <Typography.Text type="secondary">Sign in or create an account to access saved exercises</Typography.Text>
          </div>

          <Segmented
            block
            value={mode}
            onChange={(value) => setMode(value as AuthMode)}
            options={[
              { label: 'Login', value: 'login' },
              { label: 'Create Account', value: 'signup' },
            ]}
          />

          {mode === 'login' ? (
            <Form
              form={loginForm}
              layout="vertical"
              onFinish={(values) => loginMutation.mutate(values)}
            >
              <Form.Item name="username" label="Username" rules={[{ required: true }]}>
                <Input
                  placeholder="username"
                  size="large"
                  autoComplete="username"
                  onChange={(event) => {
                    loginForm.setFieldValue('username', String(event.target.value || '').toLowerCase());
                  }}
                />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password placeholder="Enter password" size="large" autoComplete="current-password" />
              </Form.Item>
              <Button
                htmlType="submit"
                icon={<LoginOutlined />}
                type="primary"
                size="large"
                block
                loading={loginMutation.isPending}
              >
                Login
              </Button>
            </Form>
          ) : (
            <Form
              form={signupForm}
              layout="vertical"
              onFinish={(values) => signupMutation.mutate(values)}
            >
              <Form.Item
                name="username"
                label="Username"
                rules={[
                  { required: true },
                  { pattern: /^[a-zA-Z0-9._-]{3,30}$/, message: '3-30 chars: letters, numbers, _, ., -' },
                  {
                    validator: async (_rule, value) => {
                      const username = String(value || '');
                      if (!username) return;
                      if (/^[._-]|[._-]$/.test(username) || /[._-]{2,}/.test(username)) {
                        throw new Error('Username cannot start/end with symbols or contain consecutive symbols');
                      }
                    },
                  },
                ]}
              >
                <Input
                  placeholder="new_username"
                  size="large"
                  autoComplete="username"
                  onChange={(event) => {
                    signupForm.setFieldValue('username', String(event.target.value || '').toLowerCase());
                  }}
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: true },
                  { min: 8, message: 'Use at least 8 characters' },
                ]}
              >
                <Input.Password placeholder="Create password" size="large" autoComplete="new-password" />
              </Form.Item>
              <Button
                htmlType="submit"
                icon={<UserAddOutlined />}
                type="primary"
                size="large"
                block
                loading={signupMutation.isPending}
              >
                Create Account
              </Button>
            </Form>
          )}
        </Space>
      </Card>
    </div>
  );
}
