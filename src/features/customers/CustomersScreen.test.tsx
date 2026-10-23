/**
 * Tests for CustomersScreen's "Add" wiring: pressing it pushes the full-page
 * `AddCustomerScreen` with `returnRouteName: 'Customers'`. There's nothing
 * else to read back here — `AddCustomerScreen` updates the shared
 * `useCustomers` store directly, so this screen's own subscription
 * re-renders on its own; that contract is `AddCustomerScreen.test.tsx`'s job.
 *
 * 2026-10: the screen stacked on the root stack (Attendance took the footer
 * slot) — the header's back affordance is pinned here too.
 */
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: jest.fn(() => mockCanGoBack),
  }),
  useFocusEffect: jest.fn(),
}));

let mockCanGoBack = true;

jest.mock('./useCustomers', () => ({
  useCustomers: jest.fn(),
  loadCustomers: jest.fn().mockResolvedValue(undefined),
}));

// The real session is empty in this test, so the role hooks are pinned:
// a company admin by default, a viewer where a test flips `mockCanWrite`.
let mockCanWrite = true;
jest.mock('../auth/useRole', () => ({
  ...jest.requireActual('../auth/useRole'),
  useCanWrite: () => mockCanWrite,
  useSessionRole: () => (mockCanWrite ? 'company_admin' : 'viewer'),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Button } from '../../components/ui';
import { useCustomers } from './useCustomers';
import CustomersScreen from './CustomersScreen';
import { CustomerRow } from './components/CustomerRow';

const useCustomersMock = useCustomers as jest.Mock;

function mockStore(overrides: Record<string, unknown> = {}) {
  useCustomersMock.mockReturnValue({
    customers: [],
    hasCustomers: false,
    isLoading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

function renderScreen() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<CustomersScreen />);
  });
  return renderer.root;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore();
  mockCanGoBack = true;
});

it('pushes AddCustomer with returnRouteName Customers when "Add" is pressed', () => {
  const root = renderScreen();
  const addButton = root.findAllByType(Button).find(b => b.props.children === 'Add');

  act(() => {
    addButton?.props.onPress();
  });

  expect(mockNavigate).toHaveBeenCalledWith('AddCustomer', {
    returnRouteName: 'Customers',
  });
});

describe('the back affordance (stacked-screen contract)', () => {
  const findBack = (root: ReactTestRenderer.ReactTestInstance) =>
    root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go back' &&
        typeof node.props.onPress === 'function',
    );

  it('goes back when there is a screen beneath (the Account tab push)', () => {
    const root = renderScreen();
    expect(findBack(root).length).toBeGreaterThan(0);
    act(() => {
      findBack(root)[0].props.onPress();
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('falls back to the tabs when the screen is the stack root (deep link)', () => {
    // goBack would strand the user with nothing beneath — reset to the
    // tabs (the same both-branch contract the attendance screens pin).
    mockCanGoBack = false;
    const root = renderScreen();
    act(() => {
      findBack(root)[0].props.onPress();
    });
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs');
  });
});

beforeEach(() => {
  mockCanWrite = true;
});

describe('a viewer (read-only)', () => {
  it('has no Add button, so nothing can push the add-customer form', () => {
    mockCanWrite = false;
    const root = renderScreen();

    expect(root.findAllByType(Button).find(b => b.props.children === 'Add')).toBeUndefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('still sees the customer list', () => {
    mockCanWrite = false;
    mockStore({
      hasCustomers: true,
      customers: [{ id: 'c1', name: 'Ravi', countryCode: '+91', phoneNumber: '9000000001' }],
    });
    const root = renderScreen();

    expect(root.findAllByType(CustomerRow)).toHaveLength(1);
  });

  it('the empty state does not tell a viewer to add customers', () => {
    mockCanWrite = false;
    const root = renderScreen();
    const text = JSON.stringify(root.findAll(() => true).map(n => n.props.description ?? ''));

    expect(text).not.toMatch(/add them manually|create a job/i);
    expect(text).toMatch(/Customers your team adds/);
  });
});
