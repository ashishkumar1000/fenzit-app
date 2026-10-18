/**
 * Targeted contract test for the OfficeFormScreen ↔ MapPinPickerScreen
 * handoff (Story 15-4; picker renamed from OfficeMapPickerScreen when the
 * customer flow started sharing it): the picker returns its FINAL pin via
 * navigate-back-with-params (`pickedLocation`, the SelectSkills pattern),
 * and the form must apply the coordinates/radius and show the GPS chip.
 * The repo pins this pattern per consumer screen (see NewJobScreen.test.tsx
 * for `createdCustomerId`/`selectedSkillId`); full screen-level suites are
 * deferred (15-4 review, decision 3a).
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

const PICKED = {
  latitude: 19.1364,
  longitude: 72.8296,
  radiusM: 200,
  gpsVerified: true,
};

function renderForm(params?: Record<string, unknown>) {
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
      <OfficeFormScreen
        navigation={navigation as never}
        route={{ params } as never}
      />,
    );
  });
  return { root: renderer.root, navigation, renderer };
}

/**
 * The form renders coordinates as 4 decimals with hemisphere letters. RN mirrors
 * nodes onto host wrappers in this tree (the React 19 duplicate-fiber quirk
 * noted in AddressPickerSheet.test.tsx), so presence is asserted as "> 0",
 * never an exact doubled count.
 */
function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return root.findAllByProps({ children: text }).length > 0;
}

describe('OfficeFormScreen pickedLocation handoff', () => {
  it('applies the picked pin — coordinates render, the placeholder is gone', () => {
    const { root } = renderForm({ pickedLocation: PICKED });

    expect(hasText(root, '19.1364° N, 72.8296° E')).toBe(true);
    expect(hasText(root, 'No location selected')).toBe(false);
  });

  it('shows the GPS Verified chip only when the pin is the device fix', () => {
    const { root } = renderForm({ pickedLocation: PICKED });
    expect(hasText(root, 'GPS Verified')).toBe(true);

    const unverified = renderForm({
      pickedLocation: { ...PICKED, gpsVerified: false },
    });
    expect(hasText(unverified.root, 'GPS Verified')).toBe(false);
  });

  it('still shows the "No location selected" placeholder without route params', () => {
    const { root } = renderForm({});

    expect(hasText(root, '19.1364° N, 72.8296° E')).toBe(false);
    expect(hasText(root, 'No location selected')).toBe(true);
  });
});

describe('OfficeFormScreen discard-changes prompt (UX finding 16)', () => {
  function renderWithGuard() {
    const view = renderForm({});
    const listener = (view.navigation.addListener.mock.calls as unknown as [string, (e: unknown) => void][])
      .filter(([event]) => event === 'beforeRemove')
      .at(-1)![1];
    const leave = () => {
      const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
      act(() => listener(e));
      return e;
    };
    const dialog = () =>
      view.root.findAll((n) => n.props?.title === 'Discard changes?' && 'visible' in n.props);
    return { ...view, leave, dialog };
  }

  it('lets a pristine Add form close without asking', () => {
    const { leave, dialog } = renderWithGuard();
    expect(leave().preventDefault).not.toHaveBeenCalled();
    expect(dialog().every((d) => d.props.visible === false)).toBe(true);
  });

  it('asks before closing once a name has been typed', () => {
    const { root, navigation } = renderForm({});
    const nameInput = root.findAll((n) => n.props?.label === 'Office name' && n.props.onChangeText)[0];
    act(() => nameInput.props.onChangeText('HQ'));
    const listener = (navigation.addListener.mock.calls as unknown as [string, (e: unknown) => void][])
      .filter(([event]) => event === 'beforeRemove')
      .at(-1)![1];
    const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    act(() => listener(e));
    expect(e.preventDefault).toHaveBeenCalled();
    const dialog = root.findAll((n) => n.props?.title === 'Discard changes?' && 'visible' in n.props);
    expect(dialog.some((d) => d.props.visible === true)).toBe(true);
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });
});
