/**
 * PickerBottomCard tests — the picker's bottom-panel contract (Story 15-4 +
 * the location-services-off recovery block, 2026-10-17):
 *
 *  - A services-off error NEVER renders as a bare failure text: it gets the
 *    warning (amber, not danger-red) notice with the EXACT matrix copy, the
 *    [Turn on location] remediation and the [Search address instead]
 *    fallback — and Confirm stays available (a device-toggle state must not
 *    lock the owner out of manual placement).
 *  - The GENERIC error row is unchanged: message text, and the ghost
 *    [Open settings] only after a second denial (canOpenSettings).
 *  - No error → neither block renders.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, InlineNotice } from '../../../components/ui';
import { colors } from '../../../theme';
import PickerBottomCard from './PickerBottomCard';

const SERVICES_OFF_COPY =
  'Location services are turned off on your device. Turn them on to place the pin.';
const GENERIC_COPY = 'Could not get your location. Try again.';

const BASE = {
  addressRow: 'Pinned near: 12.97160, 77.59460',
  addressLoading: false,
  onOpenSettings: jest.fn(),
  onOpenSearch: jest.fn(),
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

/** Resolve nested style arrays so the amber-vs-red tone is readable. */
function flatStyle(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as Record<
    string,
    unknown
  > | null;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('the services-off recovery block', () => {
  it('renders the EXACT services-off copy in a warning InlineNotice, plus [Turn on location] + [Search address instead]', () => {
    const renderer = renderCard({
      locateError: SERVICES_OFF_COPY,
      servicesOff: true,
      onEnableServices: jest.fn(),
    });

    const notice = renderer.root.findByType(InlineNotice);
    expect(notice.props.message).toBe(SERVICES_OFF_COPY);
    expect(notice.props.tone).toBe('warning');
    expect(notice.findAllByType(Text)[0].props.children).toBe(SERVICES_OFF_COPY);

    expect(button(renderer, 'Turn on location')).toBeDefined();
    expect(button(renderer, 'Search address instead')).toBeDefined();
  });

  it('the warning notice is amber, never the danger red of a failure', () => {
    const renderer = renderCard({
      locateError: SERVICES_OFF_COPY,
      servicesOff: true,
      onEnableServices: jest.fn(),
    });

    const container = renderer.root
      .findByType(InlineNotice)
      .findByProps({ accessibilityRole: 'alert' });
    const style = flatStyle(container);
    expect(style?.backgroundColor).toBe(colors.status.scheduled.bg);
    expect(style?.borderColor).toBe(colors.status.scheduled.border);
  });

  it('wires [Turn on location] → onEnableServices and [Search address instead] → onOpenSearch', () => {
    const onEnableServices = jest.fn();
    const onOpenSearch = jest.fn();
    const renderer = renderCard({
      locateError: SERVICES_OFF_COPY,
      servicesOff: true,
      onEnableServices,
      onOpenSearch,
    });

    press(renderer, 'Turn on location');
    press(renderer, 'Search address instead');

    expect(onEnableServices).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('NEVER offers the generic [Open settings] ghost while services-off (even after two denials)', () => {
    const renderer = renderCard({
      locateError: SERVICES_OFF_COPY,
      servicesOff: true,
      canOpenSettings: true,
      onEnableServices: jest.fn(),
    });

    expect(button(renderer, 'Open settings')).toBeUndefined();
    expect(BASE.onOpenSettings).not.toHaveBeenCalled();
  });

  it('Confirm stays available during services-off (manual placement is never locked out)', () => {
    const onConfirm = jest.fn();
    const renderer = renderCard({
      locateError: SERVICES_OFF_COPY,
      servicesOff: true,
      onEnableServices: jest.fn(),
      onConfirm,
    });

    press(renderer, 'Confirm location');
    expect(onConfirm).toHaveBeenCalledTimes(1);
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
    expect(button(renderer, 'Search address instead')).toBeUndefined();
    expect(renderer.root.findAllByType(InlineNotice)).toHaveLength(0);
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
  it('neither block renders — just the address row and Confirm', () => {
    const renderer = renderCard({});

    expect(renderer.root.findAllByType(InlineNotice)).toHaveLength(0);
    expect(button(renderer, 'Open settings')).toBeUndefined();
    expect(button(renderer, 'Turn on location')).toBeUndefined();
    expect(button(renderer, 'Confirm location')).toBeDefined();
  });

  it('a services-off flag with NO locate error renders no recovery block', () => {
    const renderer = renderCard({ servicesOff: true, onEnableServices: jest.fn() });

    expect(button(renderer, 'Turn on location')).toBeUndefined();
    expect(button(renderer, 'Search address instead')).toBeUndefined();
  });
});
