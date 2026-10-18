/**
 * useOverrideRemove — the confirm-dialog wording. The owner must be told
 * the right day the employee goes back to the "For everyone" weekly off.
 */
import { act, create } from 'react-test-renderer';
import type { WeeklyOffOverrideResponse } from '../../../services';
import { formatLongDate } from './weeklyOffModel';
import { useOverrideRemove } from './useOverrideRemove';

const OVERRIDE: WeeklyOffOverrideResponse = {
  employeeId: 'e1',
  employeeName: 'Priya',
  current: { days: [5], validFrom: '2026-01-01', validTo: null },
  next: null,
};

function run(
  args: Partial<Parameters<typeof useOverrideRemove>[0]>,
): ReturnType<typeof useOverrideRemove> {
  let result!: ReturnType<typeof useOverrideRemove>;
  function Probe() {
    result = useOverrideRemove({
      override: OVERRIDE,
      effectiveFrom: '',
      removeOverride: jest.fn(),
      isSaving: false,
      onClose: jest.fn(),
      ...args,
    });
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return result;
}

describe('useOverrideRemove removeMessage', () => {
  it('says "from today" when no date is chosen', () => {
    expect(run({}).removeMessage).toBe(
      'Priya will follow the "For everyone" weekly off from today.',
    );
  });

  it('names the chosen date when one is set', () => {
    expect(run({ effectiveFrom: '2099-01-05' }).removeMessage).toBe(
      `Priya will follow the "For everyone" weekly off from ${formatLongDate('2099-01-05')}.`,
    );
  });

  it('is empty in add mode (nothing to remove)', () => {
    expect(run({ override: undefined }).removeMessage).toBe('');
  });
});
