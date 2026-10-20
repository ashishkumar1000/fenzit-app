/**
 * Tests for the CustomerDetailScreen header's Edit affordance
 * (SPEC-edit-customer): the only entry into the edit flow — a stale or
 * missing customerId here would silently open the ADD form over an existing
 * customer — its absence on the not-found view, and the focus refetch that
 * is the return path making an edit visible after the edit screen itself
 * skipped the list-store upsert.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    mockFocusCallbacks.push(cb);
  },
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { customerId: mockCustomerId } }),
}));

// The real session is empty in this test, so the role hooks are pinned:
// a company admin by default, a viewer where a test flips `mockCanWrite`.
let mockCanWrite = true;
jest.mock('../../auth/useRole', () => ({
  ...jest.requireActual('../../auth/useRole'),
  useCanWrite: () => mockCanWrite,
  useSessionRole: () => (mockCanWrite ? 'company_admin' : 'viewer'),
}));

import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { IconButton } from '../../../components/ui';
import { customerService } from '../../../services';
import type { CustomerDetail } from '../../../services';
import CustomerDetailScreen from '../CustomerDetailScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
};

let mockCustomerId = 'cust-1';
const mockFocusCallbacks: Array<() => void> = [];

const getByIdSpy = jest.spyOn(customerService, 'getById');

const DETAIL: CustomerDetail = {
  id: 'cust-1',
  name: 'Priya Sharma',
  countryCode: '+91',
  phoneNumber: '9876543210',
  address: '12 MG Road',
  city: 'Bengaluru',
  createdVia: 'manual',
  createdAt: '2026-06-21T00:00:00Z',
  tenantId: 't-1',
  jobHistory: { data: [], nextCursor: null, hasMore: false },
};

const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

async function renderScreen(customerId = 'cust-1') {
  mockCustomerId = customerId;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(<CustomerDetailScreen />);
  });
  mountedRenderers.push(renderer);
  return renderer.root;
}

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
  mockFocusCallbacks.length = 0;
  jest.clearAllMocks();
});

function editButton(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByType(IconButton)
    .find(b => b.props.label === 'Edit customer');
}

it('offers the edit affordance, navigating to the edit form with the exact customerId', async () => {
  getByIdSpy.mockResolvedValue(DETAIL);
  const root = await renderScreen();

  const button = editButton(root);
  expect(button).toBeDefined();

  act(() => {
    void button?.props.onPress?.();
  });

  expect(mockNavigation.navigate).toHaveBeenCalledWith('AddCustomer', {
    customerId: 'cust-1',
  });
});

it('hides the edit affordance on the not-found view (a tap is a guaranteed second 404)', async () => {
  getByIdSpy.mockRejectedValueOnce({ status: 404 });
  const root = await renderScreen();

  expect(editButton(root)).toBeUndefined();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain("This customer isn't available");
});

it('refetches on focus — the return path that makes an edit visible (the edit screen skips the list-store upsert)', async () => {
  getByIdSpy.mockResolvedValue(DETAIL);
  await renderScreen();
  expect(getByIdSpy).toHaveBeenCalledTimes(1);

  // Returning from the edit form re-runs the silent refresh (showSpinner
  // false — content stays up while it lands).
  const focusCb = mockFocusCallbacks[mockFocusCallbacks.length - 1];
  await act(async () => {
    focusCb();
  });

  expect(getByIdSpy).toHaveBeenCalledTimes(2);
});

beforeEach(() => {
  mockCanWrite = true;
});

it('a viewer sees the customer but has no edit affordance', async () => {
  mockCanWrite = false;
  getByIdSpy.mockResolvedValue(DETAIL);
  const root = await renderScreen();

  expect(editButton(root)).toBeUndefined();
  const texts = root.findAllByType(Text).map(t => t.props.children);
  expect(texts).toContain('Priya Sharma');
});
