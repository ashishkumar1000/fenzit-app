/**
 * MyJobsSummaryCard — the Profile tab's entry point to the "My jobs"
 * record (2026-11-13). The card is an ENTRY POINT now: no numbers of its
 * own, and a tap opens the TechMyJobs screen instead of expanding in place.
 *
 * The suite pins the two things the move could break: the tap still works
 * (route `TechMyJobs` — the same stack, not a tab navigate, so hardware
 * back lands back on Profile) and the honest-affordance rules (a chevron,
 * because a real destination exists; the subtitle names what's inside).
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// react-native-svg: every primitive (Svg, Circle, Path, …) renders its
// children — the shapes themselves are not what this suite pins. A Proxy
// keeps the mock honest for whichever primitive lucide or the card uses.
jest.mock('react-native-svg', () => {
  const passthrough = (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    props.children ?? null;
  return new Proxy(
    { __esModule: true },
    {
      get: (target, prop) => {
        if (prop === '__esModule') return true;
        if (prop === 'default') return passthrough;
        return passthrough;
      },
    },
  );
});

import MyJobsSummaryCard from '../src/features/technicianApp/components/MyJobsSummaryCard';
import { Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

let renderer: ReactTestRenderer | null = null;

async function mount(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(<MyJobsSummaryCard />);
  });
  renderer = r;
  return r;
}

afterEach(() => {
  if (renderer) {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
  }
  jest.clearAllMocks();
});

describe('MyJobsSummaryCard', () => {
  it('labels itself "My jobs" with the outcome subtitle, and no numbers', async () => {
    const r = await mount();
    const text = r.root
      .findAllByType(Text)
      .map(t => t.props.children)
      .join(' ');
    expect(text).toContain('My jobs');
    expect(text).toContain('Created, approved, pending & rejected');
    // The card carries NO digits — the numbers live on the screen it opens
    // (that was the whole point of the move: the Profile tab can't go stale).
    expect(text).not.toMatch(/\d/);
  });

  it('navigates to TechMyJobs on tap — the root stack, covering the tab bar', async () => {
    const r = await mount();
    const pressable = r.root.findByProps({ accessibilityRole: 'button' });
    await act(async () => {
      pressable.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('TechMyJobs');
  });

  it('declares the destination in its accessibility hint', async () => {
    const r = await mount();
    const pressable = r.root.findByProps({ accessibilityRole: 'button' });
    expect(pressable.props.accessibilityLabel).toBe('My jobs');
    expect(pressable.props.accessibilityHint).toContain('jobs record');
  });

  it('carries a chevron — a real destination earns an exit affordance', async () => {
    // The honest-affordance rule: a tappable card with somewhere to go
    // shows it. If the chevron is ever dropped (or the card stops being a
    // destination without the chevron following it), this fails.
    const r = await mount();
    expect(r.root.findAllByType(ChevronRight)).toHaveLength(1);
  });
});
