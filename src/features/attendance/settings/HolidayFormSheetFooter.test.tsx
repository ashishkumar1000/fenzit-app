/**
 * HolidayFormSheetFooter save-error banner (weekly-off defect round 3):
 * a failure with no server reply (offline / timeout, status 0) shows the
 * approved "Couldn't save. Try again." copy, never a raw transport message
 * or a blank banner; a real server message shows verbatim; no error, no
 * banner; and the banner hides while a save is in flight.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import HolidayFormSheetFooter from './HolidayFormSheetFooter';
import type { HolidayFormSheetFooterProps } from './HolidayFormSheetFooter';
import { InlineError } from '../../../components/ui';
import type { ApiError } from '../../../services';

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) {
    const r = mounted.pop();
    act(() => r?.unmount());
  }
});

function err(partial: Partial<ApiError>): ApiError {
  return { status: 500, code: 'X', message: 'm', ...partial };
}

function renderFooter(over: Partial<HolidayFormSheetFooterProps> = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(
      <HolidayFormSheetFooter
        isEdit={false}
        isSaving={false}
        saveDisabled={false}
        saveError={null}
        onSave={jest.fn()}
        onDelete={jest.fn()}
        {...over}
      />,
    );
  });
  mounted.push(r);
  return r.root;
}

function banner(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(InlineError);
}

function allText(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(''));
}

describe('HolidayFormSheetFooter error banner', () => {
  it('shows no banner when there is no error', () => {
    expect(banner(renderFooter())).toHaveLength(0);
  });

  it('offline / timeout (status 0) shows the approved copy, not the raw message', () => {
    const root = renderFooter({
      saveError: err({ status: 0, code: 'NETWORK', message: 'Network Error' }),
    });
    expect(banner(root)).toHaveLength(1);
    expect(allText(root)).toContain("Couldn't save. Try again.");
    expect(allText(root)).not.toContain('Network Error');
  });

  it('an error with an empty message never renders a blank banner', () => {
    const root = renderFooter({ saveError: err({ status: 0, message: '' }) });
    expect(allText(root)).toContain("Couldn't save. Try again.");
    const root2 = renderFooter({ saveError: err({ status: 500, message: '' }) });
    expect(allText(root2)).toContain("Couldn't save. Try again.");
  });

  it('a server message (422) shows verbatim', () => {
    const root = renderFooter({
      saveError: err({
        status: 422,
        code: 'HOLIDAY_DATE_TAKEN',
        message: 'A holiday already exists on that date.',
      }),
    });
    expect(allText(root)).toContain('A holiday already exists on that date.');
    expect(allText(root)).not.toContain("Couldn't save. Try again.");
  });

  it('hides the banner while a save is in flight, even with a stale error', () => {
    const root = renderFooter({
      isSaving: true,
      saveError: err({ status: 0, message: 'Network Error' }),
    });
    expect(banner(root)).toHaveLength(0);
  });

  it('the banner coexists with edit-mode Delete (offline copy, delete still offered)', () => {
    const root = renderFooter({
      isEdit: true,
      saveError: err({ status: 0, message: 'timeout of 15000ms exceeded' }),
    });
    expect(allText(root)).toContain("Couldn't save. Try again.");
    expect(allText(root)).toContain('Delete holiday');
    expect(allText(root).join(' ')).not.toContain('timeout of');
  });
});
