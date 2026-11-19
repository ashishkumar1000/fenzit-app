/**
 * Screen tests for `PayslipDetailScreen` (story 23-12) — composition
 * only; the hook is mocked (its three-state tap/poll behaviour is pinned
 * in usePayslipDetail.test). Pins: the month-keyed header ("October
 * 2026"); the hero card (slip number, net pay, paid/LOP, wage period);
 * the branched 404 copy VERBATIM with Retry + Go back; earnings verbatim
 * vs the deductions' machine-source labels (pf_employee / tds /
 * head:<name> / recovery:<YYYY-MM>); the empty-deductions line; the
 * as-of-lock leave-balances section (present when rows, omitted when
 * empty); warnings as notices; and the bottom PDF button's label
 * following the live pdf status (Download PDF / Open PDF / Try again /
 * Preparing PDF…).
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('./usePayslipDetail', () => ({
  usePayslipDetail: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  Button,
  InlineError,
  InlineNotice,
} from '../../components/ui';
import { usePayslipDetail } from './usePayslipDetail';
import type { PayslipView } from '../../services';
import PayslipDetailScreen from './PayslipDetailScreen';

const usePayslipDetailMock = usePayslipDetail as jest.Mock;

type Hook = ReturnType<typeof usePayslipDetail>;

function hookState(overrides: Partial<Hook> = {}): Hook {
  return {
    payslip: null,
    isLoading: false,
    error: null,
    pdfBusy: false,
    pdfNotice: null,
    isOpening: false,
    openError: null,
    loadDetail: jest.fn(),
    downloadPdf: jest.fn(),
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
    wagePeriodStart: '2026-09-26',
    wagePeriodEnd: '2026-10-25',
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
    earningLines: [
      { name: 'Basic', amount: 20000 },
      { name: 'HRA', amount: 10000 },
    ],
    deductionLines: [
      { source: 'pf_employee', amount: 1800 },
      { source: 'head:Insurance', amount: 100 },
    ],
    leaveBalances: [
      {
        code: 'EARNED',
        name: 'Earned leave',
        accrued: 1.5,
        availed: 0,
        carryForward: 0,
        remaining: 1.5,
      },
    ],
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

function renderScreen(navigation: Nav, month = '2026-10') {
  let root!: ReactTestRenderer.ReactTestRenderer;
  const element = (n: Nav) => (
    <PayslipDetailScreen
      navigation={n as never}
      route={{ params: { month } } as never}
    />
  );
  act(() => {
    root = create(element(navigation));
  });
  return root;
}

function footerButton(
  root: ReactTestRenderer.ReactTestInstance,
): ReactTestRenderer.ReactTestInstance {
  const buttons = root.findAllByType(Button);
  // The footer button is the last non-ghost, non-secondary Button (the
  // error postures have Retry/Go back above the footer).
  return buttons[buttons.length - 1];
}

describe('PayslipDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('the first paint is the skeleton; the header is the formatted month', () => {
    usePayslipDetailMock.mockReturnValue(hookState({ isLoading: true }));
    const navigation = makeNavigation();
    const root = renderScreen(navigation);
    expect(texts(root.root)).toContain('October 2026');
    expect(texts(root.root)).not.toContain('Net pay');
  });

  it('the BE\'s branched 404 copy renders VERBATIM, with Retry and Go back', () => {
    const loadDetail = jest.fn();
    usePayslipDetailMock.mockReturnValue(
      hookState({ error: 'Payslips unlock once payroll runs.', loadDetail }),
    );
    const navigation = makeNavigation();
    const root = renderScreen(navigation);
    expect(texts(root.root)).toContain(
      'Payslips unlock once payroll runs.',
    );
    root.root
      .findAllByType(Button)
      .find(b => b.props.children === 'Retry')!
      .props.onPress();
    expect(loadDetail).toHaveBeenCalledTimes(1);
    root.root
      .findAllByType(Button)
      .find(b => b.props.children === 'Go back')!
      .props.onPress();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('the hero card: month, slip number, net pay, paid days, wage period', () => {
    usePayslipDetailMock.mockReturnValue(hookState({ payslip: makePayslip() }));
    const root = renderScreen(makeNavigation());
    const view = texts(root.root);
    expect(view).toContain('Slip PS-2026-10-0001');
    expect(view).toContain('₹48,100');
    expect(view).toContain('Net pay');
    // The hero days line is ONE composed Text.
    expect(view).toContain('26 paid days · 26 Sep 2026 – 25 Oct 2026');
  });

  it('an LOP month surfaces the LOP figure in the hero line', () => {
    usePayslipDetailMock.mockReturnValue(
      hookState({ payslip: makePayslip({ lopDays: 1.5, paidDays: 24.5 }) }),
    );
    const root = renderScreen(makeNavigation());
    expect(texts(root.root)).toContain(
      '24.5 paid days · 1.5 LOP · 26 Sep 2026 – 25 Oct 2026',
    );
  });

  it('earnings render verbatim; deductions get the machine-source labels', () => {
    usePayslipDetailMock.mockReturnValue(
      hookState({
        payslip: makePayslip({
          deductionLines: [
            { source: 'pf_employee', amount: 1800 },
            { source: 'tds', amount: 500 },
            { source: 'head:Insurance', amount: 100 },
            { source: 'recovery:2026-09', amount: 750 },
          ],
          totalDeductions: 3150,
        }),
      }),
    );
    const root = renderScreen(makeNavigation());
    const view = texts(root.root);
    expect(view).toContain('Basic');
    expect(view).toContain('HRA');
    expect(view).toContain('Gross earnings');
    expect(view).toContain('PF — employee share');
    expect(view).toContain('TDS');
    expect(view).toContain('Insurance');
    expect(view).toContain('Recovery (September 2026)');
    expect(view).toContain('Total deductions');
    expect(view).not.toContain('pf_employee');
    expect(view).not.toContain('head:');
  });

  it('a month with no deduction lines says so honestly', () => {
    usePayslipDetailMock.mockReturnValue(
      hookState({
        payslip: makePayslip({
          deductionLines: [],
          totalDeductions: 0,
        }),
      }),
    );
    const root = renderScreen(makeNavigation());
    expect(texts(root.root)).toContain('No deductions this month.');
  });

  it('the as-of-lock balances section renders; it is OMITTED when empty', () => {
    usePayslipDetailMock.mockReturnValue(hookState({ payslip: makePayslip() }));
    const root = renderScreen(makeNavigation());
    const view = texts(root.root);
    expect(view).toContain('Leave balances (as of month end)');
    expect(view).toContain('1.5 days left');
    expect(view).toContain('1.5 accrued · 0 used');

    usePayslipDetailMock.mockReturnValue(
      hookState({ payslip: makePayslip({ leaveBalances: [] }) }),
    );
    const empty = renderScreen(makeNavigation());
    expect(texts(empty.root)).not.toContain('Leave balances (as of month end)');
  });

  it('warnings render as notices (the BE\'s payroll caveats verbatim)', () => {
    usePayslipDetailMock.mockReturnValue(
      hookState({
        payslip: makePayslip({
          warnings: ['Payout includes a Comp-Off adjustment.'],
        }),
      }),
    );
    const root = renderScreen(makeNavigation());
    expect(
      root.root.findAllByType(InlineNotice)[0].props.message,
    ).toBe('Payout includes a Comp-Off adjustment.');
  });

  it('the footer button follows the pdf status: Download → Open → Try again', () => {
    usePayslipDetailMock.mockReturnValue(
      hookState({ payslip: makePayslip({ pdf: { status: 'none' } }) }),
    );
    const root = renderScreen(makeNavigation());
    expect(footerButton(root.root).props.children).toBe('Download PDF');

    usePayslipDetailMock.mockReturnValue(
      hookState({
        payslip: makePayslip({ pdf: { status: 'ready', url: 'https://x' } }),
      }),
    );
    const ready = renderScreen(makeNavigation());
    expect(footerButton(ready.root).props.children).toBe('Open PDF');

    usePayslipDetailMock.mockReturnValue(
      hookState({ payslip: makePayslip({ pdf: { status: 'failed' } }) }),
    );
    const failed = renderScreen(makeNavigation());
    expect(footerButton(failed.root).props.children).toBe('Try again');
  });

  it('a busy poll reads "Preparing PDF…" and disables the button', () => {
    usePayslipDetailMock.mockReturnValue(
      hookState({
        payslip: makePayslip({ pdf: { status: 'queued' } }),
        pdfBusy: true,
      }),
    );
    const root = renderScreen(makeNavigation());
    expect(footerButton(root.root).props.children).toBe('Preparing PDF…');
    expect(footerButton(root.root).props.disabled).toBe(true);
  });

  it('a tap calls the hook\'s three-state downloadPdf', () => {
    const downloadPdf = jest.fn();
    usePayslipDetailMock.mockReturnValue(
      hookState({ payslip: makePayslip(), downloadPdf }),
    );
    const root = renderScreen(makeNavigation());
    footerButton(root.root).props.onPress();
    expect(downloadPdf).toHaveBeenCalledTimes(1);
  });

  it('the open/open failures render in the footer slot; the notice too', () => {
    usePayslipDetailMock.mockReturnValue(
      hookState({
        payslip: makePayslip({ pdf: { status: 'ready' } }),
        openError: "Couldn't open the PDF. Try again.",
        pdfNotice: 'Still generating — try again in a bit.',
      }),
    );
    const root = renderScreen(makeNavigation());
    expect(root.root.findAllByType(InlineError)[0].props.message).toBe(
      "Couldn't open the PDF. Try again.",
    );
    expect(
      root.root.findAllByType(InlineNotice)[0].props.message,
    ).toBe('Still generating — try again in a bit.');
  });
});
