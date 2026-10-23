/**
 * Tests for SetupPending — the Attendance tab page's setup invitation
 * (CAP-3, the 2026-10 owner redesign). Pins:
 *
 *  - the progress card counts the wizard's OWN walking order (SETUP_STEPS)
 *    — the card and the wizard can never disagree.
 *  - the percent never READS below 10% (the owner's floor: an unstarted
 *    setup shows "10%" — underway, not empty); above the floor it is the
 *    exact arithmetic.
 *  - there is NO Skip: setup cannot be skipped (owner ruling 2026-10-23);
 *    Continue Setup is the one action and fires onContinue.
 *  - the unstarted pill reads "LET'S GET STARTED!", a resumed one reads
 *    "GREAT PROGRESS!".
 */
import { act, create } from 'react-test-renderer';
import { Animated, Text } from 'react-native';
import { SETUP_STEPS, type SetupStep } from '../setup/wizardModel';
import { SETUP_PCT_FLOOR, setupProgress, SetupPending } from './SetupPending';

// The confetti's looping native-driver animations are decorative; run them
// as no-ops here so no real timer outlives the suite (a leaked loop crashes
// the NEXT suite sharing this worker with a native-driver findNodeHandle
// TypeError).
jest.spyOn(Animated, 'loop').mockReturnValue({
  start: () => {},
  stop: () => {},
} as never);

describe('setupProgress — the wizard order, floored at 10%', () => {
  it('an unstarted setup reads the FLOOR, never 0%', () => {
    const p = setupProgress(null);
    expect(p.done).toBe(0);
    expect(p.total).toBe(SETUP_STEPS.length);
    expect(p.pct).toBe(SETUP_PCT_FLOOR);
    expect(p.pct).toBeGreaterThanOrEqual(10);
  });

  it('mid-setup the pct is the exact steps arithmetic (the pulse stays honest)', () => {
    const half = SETUP_STEPS[2]; // two of four done
    const p = setupProgress(half as SetupStep);
    expect(p.done).toBe(2);
    expect(p.remaining).toBe(SETUP_STEPS.length - 2);
    expect(p.pct).toBe(Math.round((2 / SETUP_STEPS.length) * 100));
  });

  it('a retired marker resumes its merged step (the wizard vocabulary)', () => {
    expect(setupProgress('timings' as SetupStep).done).toBe(
      setupProgress('offices').done,
    );
  });
});

describe('SetupPending — the invitation screen', () => {
  function render(currentStep: SetupStep | null) {
    const onContinue = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <SetupPending currentStep={currentStep} onContinue={onContinue} />,
      );
    });
    return { renderer, onContinue };
  }

  function texts(renderer: ReturnType<typeof create>): string[] {
    return renderer.root
      .findAllByType(Text)
      .map(t =>
        Array.isArray(t.props.children)
          ? t.props.children.join('')
          : String(t.props.children ?? ''),
      );
  }

  it('renders the invitation, the floored percent chip and the step counts', () => {
    const { renderer } = render(null);
    const t = texts(renderer);
    expect(t).toContain('Finish setting up attendance');
    expect(t).toContain('10%');
    expect(t).toContain(`0 of ${SETUP_STEPS.length} steps done`);
    expect(t).toContain(`${SETUP_STEPS.length} remaining`);
    expect(t).toContain("LET'S GET STARTED!");
  });

  it('a resumed setup reads GREAT PROGRESS and the exact percent', () => {
    const { renderer } = render(SETUP_STEPS[2]);
    const t = texts(renderer);
    expect(t).toContain('GREAT PROGRESS!');
    expect(t).toContain('50%');
    expect(t).toContain(`2 of ${SETUP_STEPS.length} steps done`);
  });

  it('there is NO Skip — setup cannot be skipped', () => {
    const { renderer } = render(null);
    expect(texts(renderer).some(x => /skip/i.test(x))).toBe(false);
  });

  it('Continue Setup is the one action and fires onContinue', () => {
    const { renderer, onContinue } = render(null);
    const text = renderer.root.find(
      node => node.type === Text && node.props.children === 'Continue Setup',
    );
    let node = text.parent;
    while (node != null && typeof node.props.onPress !== 'function') {
      node = node.parent;
    }
    expect(node).not.toBeNull();
    act(() => {
      node!.props.onPress();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
