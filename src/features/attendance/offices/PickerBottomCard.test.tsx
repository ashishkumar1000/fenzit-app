/**
 * PickerBottomCard tests — the picker's bottom-sheet contract (Story 15-4,
 * redesigned per ux-map-pin-picker-2026-10-18):
 *
 *  - Services OFF → the red card with the EXACT shipped copy (title names
 *    the device toggle, body never says "permission"; cancelled-red
 *    tokens), the Nearby area row whose Change link focuses the map and
 *    the [Turn on location] remediation (no in-sheet search button — the
 *    top search bar owns that) — and Confirm stays
 *    available (a device-toggle state must not lock the owner out of
 *    manual placement). The card is STATE-driven, not error-driven: it
 *    renders from `servicesOff` alone, and the generic error row never
 *    appears in this state.
 *  - Services healthy → the "LOCATION SET" chip, the "Move map to
 *    refine" hint and the address card (bold first comma segment, muted
 *    rest) whose Change link opens the address sheet.
 *  - The GENERIC error row is unchanged: message text, and the ghost
 *    [Open settings] only after a second denial (canOpenSettings).
 *  - No error → neither block renders.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Badge, Button } from '../../../components/ui';
import { colors } from '../../../theme';
import PickerBottomCard from './PickerBottomCard';

const SERVICES_OFF_TITLE = 'Your phone location is off';
const SERVICES_OFF_BODY =
  'Please turn on location in your phone settings. This helps us find the correct place.';
const GENERIC_COPY = 'Could not get your location. Try again.';

const ADDRESS = 'Shop 4, Baner Road, Pune 411045';

const BASE = {
  addressText: ADDRESS,
  addressLoading: false,
  locateError: null,
  canOpenSettings: false,
  onOpenSettings: jest.fn(),
  onOpenSearch: jest.fn(),
  onFocusMap: jest.fn(),
  onConfirm: jest.fn(),
};

function renderCard(
  props: Partial<React.ComponentProps<typeof PickerBottomCard>>,
): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<PickerBottomCard {...BASE} {...props} />);
  });
  return renderer;
}

function button(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === label);
}

function press(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): void {
  const b = button(renderer, label);
  if (!b) throw new Error(`Button "${label}" not found`);
  act(() => {
    b.props.onPress?.();
  });
}

function pressByLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): void {
  const p = renderer.root
    .findAllByProps({ accessibilityLabel: label })
    .find(n => n.props.onPress);
  if (!p) throw new Error(`Pressable "${label}" not found`);
  act(() => {
    p.props.onPress();
  });
}

function hasText(renderer: ReactTestRenderer.ReactTestRenderer, text: string) {
  return renderer.root
    .findAllByType(Text)
    .some(t => t.props.children === text);
}

/** Resolve nested style arrays so token use is readable. */
function flatStyle(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as Record<
    string,
    unknown
  > | null;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('the services-off layout (red card)', () => {
  const offProps = { servicesOff: true, onEnableServices: jest.fn() };

  it('renders the EXACT frozen title + body; the body never says "permission"; remediation + fallback buttons render', () => {
    const renderer = renderCard(offProps);

    expect(hasText(renderer, SERVICES_OFF_TITLE)).toBe(true);
    expect(hasText(renderer, SERVICES_OFF_BODY)).toBe(true);
    expect(
      renderer.root
        .findAllByType(Text)
        .some(t => String(t.props.children).match(/permission/i)),
    ).toBe(false);

    expect(button(renderer, 'Turn on location')).toBeDefined();
    // No separate manual-search button (user decision 2026-10-18): the top
    // search bar owns that action.
    expect(button(renderer, 'Search or enter address manually')).toBeUndefined();
    expect(hasText(renderer, 'Nearby area: Shop 4, Baner Road, Pune 411045')).toBe(true);
  });

  it('the card uses the red (cancelled) family — the owner wants services-off to read as not-good (2026-10-18 decision)', () => {
    const renderer = renderCard(offProps);

    // The RN preset surfaces each View twice (class wrapper + host node);
    // the host node carries the flattened style.
    const hostAlerts = renderer.root
      .findAllByProps({ accessibilityRole: 'alert' })
      .filter((n: ReactTestRenderer.ReactTestInstance) => typeof n.type === 'string');
    expect(hostAlerts).toHaveLength(1);
    const style = flatStyle(hostAlerts[0]);
    expect(style?.backgroundColor).toBe(colors.status.cancelled.bg);
    expect(style?.borderColor).toBe(colors.status.cancelled.border);
  });

  it('wires [Turn on location] → onEnableServices; the sheet never wires a manual-search button (the top bar owns it)', () => {
    const onEnableServices = jest.fn();
    const onOpenSearch = jest.fn();
    const renderer = renderCard({
      servicesOff: true,
      onEnableServices,
      onOpenSearch,
    });

    press(renderer, 'Turn on location');

    expect(onEnableServices).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).not.toHaveBeenCalled();
  });

  it('the Nearby area row Change link focuses the map (the manual-drag hint), not the sheet', () => {
    const onFocusMap = jest.fn();
    const renderer = renderCard({ onFocusMap, ...offProps });

    pressByLabel(renderer, 'Change area');

    expect(onFocusMap).toHaveBeenCalledTimes(1);
    expect(BASE.onOpenSearch).not.toHaveBeenCalled();
  });

  it('NEVER offers the generic [Open settings] ghost while services-off (even after two denials)', () => {
    const renderer = renderCard({
      ...offProps,
      canOpenSettings: true,
    });

    expect(button(renderer, 'Open settings')).toBeUndefined();
    expect(BASE.onOpenSettings).not.toHaveBeenCalled();
  });

  it('renders NO generic error row while services-off — the hook message is replaced by the card copy', () => {
    const renderer = renderCard({
      ...offProps,
      locateError:
        'Location services are turned off on your device. Turn them on to place the pin.',
    });

    // The old services-off error text appears nowhere; the frozen card copy
    // is the only rendering of this state.
    expect(
      hasText(
        renderer,
        'Location services are turned off on your device. Turn them on to place the pin.',
      ),
    ).toBe(false);
    expect(
      renderer.root
        .findAllByProps({ accessibilityRole: 'alert' })
        .filter(
          (n: ReactTestRenderer.ReactTestInstance) => typeof n.type === 'string',
        ),
    ).toHaveLength(1); // the red card is the only alert-shaped node
  });

  it('Confirm stays available during services-off (manual placement is never locked out)', () => {
    const onConfirm = jest.fn();
    const renderer = renderCard({ ...offProps, onConfirm });

    press(renderer, 'Confirm location');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('is STATE-driven: the red card renders from servicesOff alone, with no locate error', () => {
    const renderer = renderCard({ servicesOff: true, onEnableServices: jest.fn() });

    expect(hasText(renderer, SERVICES_OFF_TITLE)).toBe(true);
    expect(button(renderer, 'Turn on location')).toBeDefined();
  });
});

describe('the pinned layout (services healthy)', () => {
  it('renders the LOCATION SET chip, the adjust hint and the address card (bold name + muted rest)', () => {
    const renderer = renderCard({});

    expect(hasText(renderer, 'LOCATION SET')).toBe(true);
    expect(hasText(renderer, 'Move map to adjust')).toBe(true);

    const badge = renderer.root.findByType(Badge);
    expect(badge.props.status).toBe('done');
    const badgeStyle = flatStyle(badge.findByType(View));
    expect(badgeStyle?.backgroundColor).toBe(colors.status.done.bg);

    // The bold first line is the first comma segment; the rest is muted.
    expect(hasText(renderer, 'Shop 4')).toBe(true);
    expect(hasText(renderer, 'Baner Road, Pune 411045')).toBe(true);
    const name = renderer.root
      .findAllByType(Text)
      .find(t => t.props.children === 'Shop 4');
    expect(StyleSheet.flatten(name!.props.style as never)?.color).toBe(
      colors.textStrong,
    );

    const card = renderer.root
      .findAllByProps({ testID: 'picker-address-card' })
      .find((n: ReactTestRenderer.ReactTestInstance) => typeof n.type === 'string');
    expect(flatStyle(card!)?.backgroundColor).toBe(colors.surfaceSunken);
  });

  it('a raw "lat, lng" fallback label stays ONE value — never split into a bold name + rest at its comma', () => {
    const renderer = renderCard({ addressText: '12.97160, 77.59460' });

    expect(hasText(renderer, '12.97160, 77.59460')).toBe(true);
    expect(hasText(renderer, '12.97160')).toBe(false);
    expect(hasText(renderer, '77.59460')).toBe(false);
  });

  it('the address card Change link opens the address sheet', () => {
    const onOpenSearch = jest.fn();
    const renderer = renderCard({ onOpenSearch });

    pressByLabel(renderer, 'Change address');

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('hides no remediation buttons and renders no red card', () => {
    const renderer = renderCard({});

    expect(button(renderer, 'Turn on location')).toBeUndefined();
    expect(
      button(renderer, 'Search or enter address manually'),
    ).toBeUndefined();
    expect(
      renderer.root.findAllByProps({ accessibilityRole: 'alert' }),
    ).toHaveLength(0);
  });
});

describe('the generic error row (unchanged)', () => {
  it('renders the failure text; NO [Open settings] ghost before a second denial; no services-off buttons', () => {
    const renderer = renderCard({ locateError: GENERIC_COPY });

    const text = renderer.root
      .findAllByType(Text)
      .find(t => t.props.children === GENERIC_COPY);
    expect(text).toBeDefined();

    expect(button(renderer, 'Open settings')).toBeUndefined();
    expect(button(renderer, 'Turn on location')).toBeUndefined();
    expect(button(renderer, 'Search or enter address manually')).toBeUndefined();
  });

  it('after a second denial (canOpenSettings) the ghost [Open settings] appears and fires onOpenSettings', () => {
    const renderer = renderCard({
      locateError: GENERIC_COPY,
      canOpenSettings: true,
    });

    press(renderer, 'Open settings');
    expect(BASE.onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('no error', () => {
  it('neither block renders — just the pinned layout and Confirm', () => {
    const renderer = renderCard({});

    expect(
      renderer.root.findAllByProps({ accessibilityRole: 'alert' }),
    ).toHaveLength(0);
    expect(hasText(renderer, GENERIC_COPY)).toBe(false);
    expect(button(renderer, 'Open settings')).toBeUndefined();
    expect(button(renderer, 'Turn on location')).toBeUndefined();
    expect(button(renderer, 'Confirm location')).toBeDefined();
  });

  it('a loading reverse geocode shows the spinner instead of the address card copy', () => {
    const renderer = renderCard({ addressLoading: true });

    expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(hasText(renderer, 'Shop 4')).toBe(false);
  });
});
