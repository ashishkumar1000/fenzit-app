/**
 * OfficeFormScreen — leaving and error clearing (UX findings 2 and 16).
 *  - A successful Save or Archive goes back WITHOUT the "Discard changes?"
 *    prompt, even on a dirty form (the guard is stepped past).
 *  - A failed Save leaves the guard armed (edits are still unsaved).
 *  - Editing a field clears its own error, a server "name taken", and the
 *    error of the field validated against it (start→end, full→half).
 */
jest.mock('../../../services', () => ({
  officesService: {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import OfficeFormScreen from './OfficeFormScreen';
import { officesService } from '../../../services';

const svc = officesService as unknown as Record<'get' | 'create' | 'update' | 'archive', jest.Mock>;

const PICKED = { latitude: 19.1364, longitude: 72.8296, radiusM: 200, gpsVerified: false };

type Root = ReactTestRenderer.ReactTestInstance;

function render(params?: Record<string, unknown>) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    popTo: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <OfficeFormScreen navigation={navigation as never} route={{ params } as never} />,
    );
  });
  const leave = () => {
    const calls = navigation.addListener.mock.calls as unknown as [string, (e: unknown) => void][];
    const listener = calls.filter(([ev]) => ev === 'beforeRemove').at(-1)![1];
    const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    act(() => listener(e));
    return e;
  };
  return { root: renderer.root, navigation, leave };
}

const byLabel = (root: Root, label: string) =>
  root.findAll((n) => n.props?.label === label && typeof n.props.onChangeText === 'function')[0];
const press = (root: Root, text: string) =>
  root.findAll((n) => n.props?.children === text && typeof n.props.onPress === 'function')[0];
const type = (root: Root, label: string, value: string) =>
  act(() => byLabel(root, label).props.onChangeText(value));

async function tap(root: Root, text: string) {
  await act(async () => {
    press(root, text).props.onPress();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Create office', () => {
  it('goes back without the discard prompt after a successful save', async () => {
    svc.create.mockResolvedValue({});
    const { root, navigation, leave } = render({ pickedLocation: PICKED });
    type(root, 'Office name', 'HQ');

    await tap(root, 'Create office');

    expect(svc.create).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(leave().preventDefault).not.toHaveBeenCalled();
  });

  it('keeps the guard armed when the save fails', async () => {
    svc.create.mockRejectedValue({ message: 'Server down', status: 500 });
    const { root, navigation, leave } = render({ pickedLocation: PICKED });
    type(root, 'Office name', 'HQ');

    await tap(root, 'Create office');

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(leave().preventDefault).toHaveBeenCalled();
  });
});

describe('Archive office', () => {
  const detail = {
    id: 'o1',
    name: 'Andheri',
    latitude: 19.1,
    longitude: 72.8,
    radiusM: 100,
    archivedAt: null,
    rules: [
      {
        id: 'r1',
        startTime: '09:00',
        endTime: '18:00',
        lateCutoffMinutes: 15,
        fullDayHours: 8,
        halfDayHours: 4,
        validFrom: '2026-09-01',
        validTo: null,
      },
    ],
  };

  it('goes back without the discard prompt after archiving a dirty form', async () => {
    svc.get.mockResolvedValue(detail);
    svc.archive.mockResolvedValue(undefined);
    const { root, navigation, leave } = render({ officeId: 'o1' });
    await act(async () => {});
    type(root, 'Office name', 'Andheri renamed');

    await tap(root, 'Archive office');
    // the dialog's own confirm button carries the same label
    const confirm = root.findAll(
      (n) => n.props?.confirmLabel === 'Archive office' && typeof n.props.onConfirm === 'function',
    )[0];
    await act(async () => {
      confirm.props.onConfirm();
    });

    expect(svc.archive).toHaveBeenCalledWith('o1');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(leave().preventDefault).not.toHaveBeenCalled();
  });
});

describe('error clearing on edit', () => {
  it('clears the name error as soon as a name is typed', async () => {
    const { root } = render({});
    await tap(root, 'Create office');
    expect(byLabel(root, 'Office name').props.error).toBeTruthy();

    type(root, 'Office name', 'H');

    expect(byLabel(root, 'Office name').props.error).toBeFalsy();
  });

  it('clears a server "name taken" error when the name changes', async () => {
    svc.create.mockRejectedValue({ code: 'ATTENDANCE_OFFICE_NAME_TAKEN', message: 'taken', status: 409 });
    const { root } = render({ pickedLocation: PICKED });
    type(root, 'Office name', 'HQ');
    await tap(root, 'Create office');
    expect(byLabel(root, 'Office name').props.error).toMatch(/already used/);

    type(root, 'Office name', 'HQ 2');

    expect(byLabel(root, 'Office name').props.error).toBeFalsy();
  });

  it('editing full-day hours clears the half-day error', async () => {
    const { root } = render({ pickedLocation: PICKED });
    type(root, 'Office name', 'HQ');
    type(root, 'Full-day hours', '4');
    type(root, 'Half-day hours', '6');
    await tap(root, 'Create office');
    expect(byLabel(root, 'Half-day hours').props.error).toMatch(/less than full-day/);

    type(root, 'Full-day hours', '8');

    expect(byLabel(root, 'Half-day hours').props.error).toBeFalsy();
  });

  it('editing one field leaves another field\'s error alone', async () => {
    const { root } = render({});
    type(root, 'Late after (minutes)', '999');
    await tap(root, 'Create office');
    expect(byLabel(root, 'Late after (minutes)').props.error).toBeTruthy();
    expect(byLabel(root, 'Office name').props.error).toBeTruthy();

    type(root, 'Late after (minutes)', '15');

    expect(byLabel(root, 'Late after (minutes)').props.error).toBeFalsy();
    expect(byLabel(root, 'Office name').props.error).toBeTruthy();
  });
});
