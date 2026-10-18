/**
 * OfficeFormScreen — the pin's address end to end: it is saved with a new
 * office, shown from the saved office on edit, resent with every profile
 * write (the server clears an address sent without one), kept when a failed
 * lookup re-picks the SAME pin, dropped when the pin MOVES without an
 * address, and saved when a re-picked pin gains one.
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
import { Text } from 'react-native';
import OfficeFormScreen from './OfficeFormScreen';
import { officesService } from '../../../services';

const svc = officesService as unknown as Record<'get' | 'create' | 'update', jest.Mock>;
type Root = ReactTestRenderer.ReactTestInstance;

const ADDRESS = 'Koramangala, Bengaluru';
const OTHER = 'HSR Layout, Bengaluru';
const PIN = { latitude: 12.9352, longitude: 77.6245 };

function detail(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    name: 'Andheri',
    ...PIN,
    radiusM: 100,
    archivedAt: null,
    formattedAddress: ADDRESS,
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
    ...over,
  };
}

function picked(over: Record<string, unknown> = {}) {
  return { ...PIN, radiusM: 100, gpsVerified: false, ...over };
}

async function mount(params: Record<string, unknown>) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    popTo: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };
  let r!: ReactTestRenderer.ReactTestRenderer;
  const el = (p: Record<string, unknown>) => (
    <OfficeFormScreen navigation={navigation as never} route={{ params: p } as never} />
  );
  await act(async () => {
    r = create(el(params));
  });
  return {
    root: r.root,
    navigation,
    /** The picker returning: the same screen with new route params. */
    returnFromPicker: (pickedLocation: Record<string, unknown>) =>
      act(() => {
        r.update(el({ ...params, pickedLocation }));
      }),
  };
}

const texts = (root: Root) => root.findAllByType(Text).map((t) => String(t.props.children));
const hasText = (root: Root, value: string) => texts(root).includes(value);
const byLabel = (root: Root, label: string) =>
  root.findAll((n) => n.props?.label === label && typeof n.props.onChangeText === 'function')[0];
const type = (root: Root, label: string, value: string) =>
  act(() => byLabel(root, label).props.onChangeText(value));
const tap = async (root: Root, text: string) => {
  const btn = root.findAll((n) => n.props?.children === text && typeof n.props.onPress === 'function')[0];
  await act(async () => {
    btn.props.onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  svc.create.mockResolvedValue({});
  svc.update.mockResolvedValue(detail());
});

describe('Add office', () => {
  it('saves the picked address with the new office and shows it on the card', async () => {
    const { root } = await mount({ pickedLocation: picked({ address: ADDRESS }) });
    expect(hasText(root, ADDRESS)).toBe(true);
    type(root, 'Office name', 'HQ');

    await tap(root, 'Create office');

    expect(svc.create.mock.calls[0][0]).toMatchObject({ name: 'HQ', formattedAddress: ADDRESS });
  });

  it('with no address found, sends none (not an empty string)', async () => {
    const { root } = await mount({ pickedLocation: picked() });
    type(root, 'Office name', 'HQ');

    await tap(root, 'Create office');

    expect('formattedAddress' in svc.create.mock.calls[0][0]).toBe(false);
  });
});

describe('Edit office', () => {
  beforeEach(() => svc.get.mockResolvedValue(detail()));

  it('shows the saved address when the form opens', async () => {
    const { root } = await mount({ officeId: 'o1' });
    expect(hasText(root, ADDRESS)).toBe(true);
  });

  it('shows nothing made-up for an office saved without an address', async () => {
    svc.get.mockResolvedValue(detail({ formattedAddress: null }));
    const { root } = await mount({ officeId: 'o1' });
    expect(hasText(root, ADDRESS)).toBe(false);
  });

  it('saving with nothing changed writes nothing', async () => {
    const { root, navigation } = await mount({ officeId: 'o1' });

    await tap(root, 'Save changes');

    expect(svc.update).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('a rename resends the pin and the saved address, so the server does not clear it', async () => {
    const { root } = await mount({ officeId: 'o1' });
    type(root, 'Office name', 'Andheri HQ');

    await tap(root, 'Save changes');

    expect(svc.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ name: 'Andheri HQ', ...PIN, formattedAddress: ADDRESS }),
    );
  });

  it('re-picking the SAME pin when the lookup finds no address keeps the saved one', async () => {
    const { root, returnFromPicker } = await mount({ officeId: 'o1' });
    returnFromPicker(picked());
    expect(hasText(root, ADDRESS)).toBe(true);
    type(root, 'Office name', 'Andheri HQ');

    await tap(root, 'Save changes');

    expect(svc.update.mock.calls[0][1].formattedAddress).toBe(ADDRESS);
  });

  it('moving the pin with no address found drops the old address (it would name another place)', async () => {
    const { root, returnFromPicker } = await mount({ officeId: 'o1' });
    returnFromPicker(picked({ latitude: 12.9, longitude: 77.6 }));
    expect(hasText(root, ADDRESS)).toBe(false);

    await tap(root, 'Save changes');

    const patch = svc.update.mock.calls[0][1];
    expect(patch).toMatchObject({ latitude: 12.9, longitude: 77.6 });
    expect('formattedAddress' in patch).toBe(false);
  });

  it('moving the pin with a new address saves the new one', async () => {
    const { root, returnFromPicker } = await mount({ officeId: 'o1' });
    returnFromPicker(picked({ latitude: 12.9, longitude: 77.6, address: OTHER }));
    expect(hasText(root, OTHER)).toBe(true);

    await tap(root, 'Save changes');

    expect(svc.update.mock.calls[0][1]).toMatchObject({ latitude: 12.9, longitude: 77.6, formattedAddress: OTHER });
  });

  it('an office saved before addresses existed gains one when its pin is re-picked in place', async () => {
    svc.get.mockResolvedValue(detail({ formattedAddress: null }));
    const { root, returnFromPicker } = await mount({ officeId: 'o1' });
    returnFromPicker(picked({ address: ADDRESS }));

    await tap(root, 'Save changes');

    expect(svc.update).toHaveBeenCalledWith('o1', expect.objectContaining({ ...PIN, formattedAddress: ADDRESS }));
  });

  it('a legacy office with a failed lookup stays address-less and writes nothing', async () => {
    svc.get.mockResolvedValue(detail({ formattedAddress: null }));
    const { root, returnFromPicker } = await mount({ officeId: 'o1' });
    returnFromPicker(picked());

    await tap(root, 'Save changes');

    expect(svc.update).not.toHaveBeenCalled();
  });

  it('a timing-only change leaves the pin and address out of the request', async () => {
    const { root } = await mount({ officeId: 'o1' });
    type(root, 'Late after (minutes)', '30');

    await tap(root, 'Save changes');

    const patch = svc.update.mock.calls[0][1];
    expect(patch.lateCutoffMinutes).toBe(30);
    expect('formattedAddress' in patch).toBe(false);
    expect('latitude' in patch).toBe(false);
  });

  it('asks before leaving when only the address changed (same-spot re-pick on a legacy office)', async () => {
    svc.get.mockResolvedValue(detail({ formattedAddress: null }));
    const { navigation, returnFromPicker } = await mount({ officeId: 'o1' });
    returnFromPicker(picked({ address: ADDRESS }));
    const listener = (navigation.addListener.mock.calls as unknown as [string, (e: unknown) => void][])
      .filter(([event]) => event === 'beforeRemove')
      .at(-1)![1];
    const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    act(() => listener(e));
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('does not ask when the re-pick changed nothing', async () => {
    svc.get.mockResolvedValue(detail({ formattedAddress: ADDRESS }));
    const { navigation, returnFromPicker } = await mount({ officeId: 'o1' });
    returnFromPicker(picked({ address: ADDRESS }));
    const listener = (navigation.addListener.mock.calls as unknown as [string, (e: unknown) => void][])
      .filter(([event]) => event === 'beforeRemove')
      .at(-1)![1];
    const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    act(() => listener(e));
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
