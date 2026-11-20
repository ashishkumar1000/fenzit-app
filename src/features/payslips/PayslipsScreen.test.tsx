/**
 * Screen tests for `PayslipsScreen` (story 23-12) — composition only;
 * the hook is mocked (its behaviour is pinned in useMyPayslips.test).
 * Pins: the four postures (skeleton / empty-is-honest / error + Retry /
 * rows), the row anatomy (month, net pay, paid/LOP line, slip number,
 * the live pdf badge) via the REAL PayslipRow, and the month-keyed tap
 * (`MyPayslipDetail` carries `{ month }` — never membershipId/runId).
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('./useMyPayslips', () => ({
  useMyPayslips: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, Card, InlineError } from '../../components/ui';
import { useMyPayslips } from './useMyPayslips';
import type { PayslipView } from '../../services';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import PayslipsScreen from './PayslipsScreen';

const useMyPayslipsMock = useMyPayslips as jest.Mock;

type Hook = ReturnType<typeof useMyPayslips>;

function hookState(overrides: Partial<Hook> = {}): Hook {
  return {
    payslips: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    load: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  } as unknown as Hook;
}

function makePayslip(overrides: Partial<PayslipView> = {}): PayslipView {
  return {
    id: 'ps-1',
    membershipId: 'm-1',
    runId: 'run-1',
    month: '2026-10',
    slipNumber: 'PS-2026-10-0001',
    employeeName: 'Ajay Sharma',
    employeeCode: 'EMP-042',
    fatherName: null,
    motherName: null,
    spouseName: null,
    designation: null,
    department: null,
    pan: null,
    uanNumber: null,
    bankAccountNumber: null,
    ifscCode: null,
    bankName: null,
    dateOfJoining: null,
    establishmentName: null,
    establishmentAddress: null,
    wagePeriodStart: null,
    wagePeriodEnd: null,
    divisorConvention: null,
    cutoffDay: 25,
    payDate: 5,
    payableDays: 26,
    lopDays: 0,
    paidDays: 26,
    daysWorked: null,
    grossEarnings: 50000,
    pfEmployee: 1800,
    pfEmployer: 1800,
    tds: 0,
    otherDeductions: 0,
    totalDeductions: 1900,
    netWages: 48100,
    earningLines: [],
    deductionLines: [],
    leaveBalances: [],
    warnings: [],
    createdAt: '2026-11-05T10:00:00.000Z',
    pdf: { status: 'none' },
    ...overrides,
  };
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

type Nav = {
  navigate: jest.Mock;
  goBack: jest.Mock;
  setParams: jest.Mock;
};

function makeNavigation(): Nav {
  return { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
}

function renderScreen(navigation: Nav) {
  let root!: ReactTestRenderer.ReactTestRenderer;
  const element = (n: Nav) => (
    <PayslipsScreen
      navigation={n as never}
      route={{} as never}
    />
  );
  act(() => {
    root = create(element(navigation));
  });
  return root;
}

describe('PayslipsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('the first paint is the skeleton (isLoading), not the empty copy', () => {
    useMyPayslipsMock.mockReturnValue(hookState({ isLoading: true }));
    const root = renderScreen(makeNavigation());
    expect(texts(root.root)).toContain('Payslips');
    expect(texts(root.root)).not.toContain('No payslips yet');
  });

  it('an empty list renders the honest no-locks copy — never an error', () => {
    useMyPayslipsMock.mockReturnValue(hookState());
    const root = renderScreen(makeNavigation());
    expect(texts(root.root)).toContain('No payslips yet');
    expect(texts(root.root)).toContain(
      'Yours will appear here after payroll runs.',
    );
  });

  it('a load failure renders the message verbatim + Retry wired to refresh', () => {
    const refresh = jest.fn();
    useMyPayslipsMock.mockReturnValue(
      hookState({
        error: "Couldn't load your payslips. Check your connection and try again.",
        refresh,
      }),
    );
    const root = renderScreen(makeNavigation());
    expect(root.root.findAllByType(InlineError)[0].props.message).toBe(
      "Couldn't load your payslips. Check your connection and try again.",
    );
    const retry = root.root
      .findAllByType(Button)
      .find(b => b.props.children === 'Retry');
    expect(retry).toBeDefined();
    retry!.props.onPress();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a refresh failure with rows on screen keeps the rows — banner + Retry above them, never a blank list (Sally F2)', () => {
    const refresh = jest.fn();
    useMyPayslipsMock.mockReturnValue(
      hookState({
        payslips: [makePayslip()],
        error: "Couldn't load your payslips. Check your connection and try again.",
        refresh,
      }),
    );
    const root = renderScreen(makeNavigation());
    const view = texts(root.root);
    // The stale rows survive the failure.
    expect(view).toContain('October 2026');
    expect(view).toContain('₹48,100');
    // The banner + Retry ride the list header above the kept rows.
    expect(root.root.findAllByType(InlineError)[0].props.message).toBe(
      "Couldn't load your payslips. Check your connection and try again.",
    );
    const retry = root.root
      .findAllByType(Button)
      .find(b => b.props.children === 'Retry');
    expect(retry).toBeDefined();
    retry!.props.onPress();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('rows render the month, net pay, paid/LOP line, slip number and the pdf badge', () => {
    useMyPayslipsMock.mockReturnValue(
      hookState({
        payslips: [
          makePayslip({
            pdf: { status: 'ready' },
            lopDays: 0.5,
          }),
          makePayslip({
            id: 'ps-2',
            month: '2026-09',
            slipNumber: 'PS-2026-09-0001',
            netWages: 47750.5,
            pdf: { status: 'queued' },
          }),
        ],
      }),
    );
    const root = renderScreen(makeNavigation());
    const view = texts(root.root);
    expect(view).toContain('October 2026');
    expect(view).toContain('September 2026');
    expect(view).toContain('₹48,100');
    expect(view).toContain('26 paid days · 0.5 LOP');
    expect(view).toContain('26 paid days'); // the zero-LOP row omits the suffix
    expect(view).toContain('Slip PS-2026-10-0001');
    expect(view).toContain('Ready');
    expect(view).toContain('Making PDF');
  });

  it('the row tap pushes MyPayslipDetail with the month only', () => {
    useMyPayslipsMock.mockReturnValue(
      hookState({ payslips: [makePayslip()] }),
    );
    const navigation = makeNavigation();
    const root = renderScreen(navigation);
    // The row's Card carries onPress; its innermost pressable is the tap.
    const card = root.root.findAllByType(Card).find(c => c.props.onPress);
    expect(card).toBeDefined();
    const pressable = card!
      .findAll(n => typeof n.props.onPress === 'function')
      .at(-1)!;
    pressable.props.onPress();
    expect(navigation.navigate).toHaveBeenCalledWith('MyPayslipDetail', {
      month: '2026-10',
    });
  });
});
