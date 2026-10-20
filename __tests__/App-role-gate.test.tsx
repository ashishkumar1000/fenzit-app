/**
 * App.tsx's role gate — the RealtimeBridge mounts in BOTH role branches
 * (Story 14-3; owner since 3.3). The bridge components are tested in
 * isolation elsewhere, so only App's decision to mount them is pinned here:
 * removing `<RealtimeBridge />` from either branch fails the matching test
 * (the technician's socket can only ever open from the technician branch).
 * The navigation trees are stubbed — this file is about the role gate.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

type MockSession = {
  role: 'company_admin' | 'employee' | 'viewer' | null;
  tenantId: string | null;
  platformAdmin: boolean;
} | null;
let mockSession: MockSession = null;
jest.mock('../src/features/auth', () => {
  const { Text } = require('react-native');
  return {
    // The REAL role helpers — the gate's decision is what is under test.
    ...jest.requireActual('../src/features/auth/roles'),
    ...jest.requireActual('../src/features/auth/useRole'),
    useAuth: () => ({
      status: mockSession ? 'done' : 'pending',
      session: mockSession,
      complete: jest.fn(),
    }),
    expireSession: jest.fn(),
    AuthFlow: () => <Text testID="auth-flow">auth</Text>,
    NoAccessScreen: (props: { platformAdmin: boolean }) => (
      <Text testID="no-access" accessibilityLabel={String(props.platformAdmin)}>
        no access
      </Text>
    ),
  };
});
jest.mock('../src/features/onboarding', () => ({
  OnboardingScreen: () => null,
  useOnboarding: () => ({ status: 'done', complete: jest.fn() }),
}));
jest.mock('../src/features/splash', () => ({ AnimatedBootSplash: () => null }));
jest.mock('../src/services', () => ({
  runAllResets: jest.fn(),
  setOnUnauthorized: jest.fn(),
  setOnForbidden: jest.fn(),
  // App pulls server-driven config on mount + foreground (remoteConfig spec).
  refreshRemoteConfig: jest.fn(),
}));
jest.mock('../src/navigation/RootNavigator', () => {
  const { Text } = require('react-native');
  return () => <Text testID="admin-tree">admin tree</Text>;
});
jest.mock('../src/navigation/TechnicianRootNavigator', () => {
  const { Text } = require('react-native');
  return () => <Text testID="employee-tree">employee tree</Text>;
});
// SafeAreaProvider defers its children to the native insets callback, which
// never fires in jest — render the children directly.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const React = require('react');
  return {
    ...actual,
    SafeAreaProvider: (props: { children: React.ReactNode }) => props.children,
  };
});
jest.mock('../src/features/notifications/RealtimeBridge', () => {
  const { Text } = require('react-native');
  return { RealtimeBridge: () => <Text testID="realtime-bridge">bridge</Text> };
});

import App from '../src/App';

beforeEach(() => {
  mockSession = null;
});

afterEach(() => {
  jest.clearAllMocks();
});

async function mountApp() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  return renderer;
}

const has = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAllByProps({ testID: id }).length > 0;

it('the employee branch mounts the employee tree and the RealtimeBridge (the employee socket can only open here)', async () => {
  mockSession = { role: 'employee', tenantId: 'tenant-1', platformAdmin: false };

  const renderer = await mountApp();

  expect(has(renderer, 'employee-tree')).toBe(true);
  expect(has(renderer, 'admin-tree')).toBe(false);
  expect(has(renderer, 'realtime-bridge')).toBe(true);
});

it('the company admin branch mounts the admin tree and the RealtimeBridge too — one bridge for every role', async () => {
  mockSession = { role: 'company_admin', tenantId: 'tenant-1', platformAdmin: false };

  const renderer = await mountApp();

  expect(has(renderer, 'admin-tree')).toBe(true);
  expect(has(renderer, 'employee-tree')).toBe(false);
  expect(has(renderer, 'realtime-bridge')).toBe(true);
});

it('a viewer gets the admin screens (read-only is applied inside them), never the employee tree', async () => {
  mockSession = { role: 'viewer', tenantId: 'tenant-1', platformAdmin: false };

  const renderer = await mountApp();

  expect(has(renderer, 'admin-tree')).toBe(true);
  expect(has(renderer, 'employee-tree')).toBe(false);
  expect(has(renderer, 'no-access')).toBe(false);
});

describe('people who cannot open any company see only the no-access screen', () => {
  const cases: Array<[string, NonNullable<MockSession>]> = [
    ['no role and no company (removed person)', { role: null, tenantId: null, platformAdmin: false }],
    ['a role but no company (half-set-up data)', { role: 'company_admin', tenantId: null, platformAdmin: false }],
    ['a company but no role', { role: null, tenantId: 'tenant-1', platformAdmin: false }],
    ['Fenzit staff', { role: null, tenantId: null, platformAdmin: true }],
    ['Fenzit staff even with a stale company and role', { role: 'company_admin', tenantId: 'tenant-1', platformAdmin: true }],
    ['an unknown stored role', { role: 'owner' as never, tenantId: 'tenant-1', platformAdmin: false }],
  ];

  it.each(cases)('%s', async (_name, session) => {
    mockSession = session;

    const renderer = await mountApp();

    expect(has(renderer, 'no-access')).toBe(true);
    expect(has(renderer, 'admin-tree')).toBe(false);
    expect(has(renderer, 'employee-tree')).toBe(false);
    // No Realtime socket, no token exchange, no stores for these people.
    expect(has(renderer, 'realtime-bridge')).toBe(false);
  });

  it('tells the screen whether the person is Fenzit staff', async () => {
    mockSession = { role: null, tenantId: null, platformAdmin: true };
    const staff = await mountApp();
    expect(staff.root.findByProps({ testID: 'no-access' }).props.accessibilityLabel).toBe('true');

    mockSession = { role: null, tenantId: null, platformAdmin: false };
    const removed = await mountApp();
    expect(removed.root.findByProps({ testID: 'no-access' }).props.accessibilityLabel).toBe('false');
  });
});

it('no session at all shows the login flow, not the no-access screen', async () => {
  mockSession = null;
  const renderer = await mountApp();

  expect(has(renderer, 'auth-flow')).toBe(true);
  expect(has(renderer, 'no-access')).toBe(false);
  expect(has(renderer, 'admin-tree')).toBe(false);
  expect(has(renderer, 'employee-tree')).toBe(false);
});
