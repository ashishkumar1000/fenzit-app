/**
 * Tests for `LeaveTypeEditorCard` (the two-tab Leave redesign, 2026-11):
 * the inert Save's "No changes yet" caption (the pale disabled button used
 * to explain nothing — the review round), its disappearance while dirty
 * and its replacement by "Saved." after a clean save, and the whole-row
 * pressable toggles (the switch thumb alone was the only obvious target;
 * an inner switch touch must not double-fire through the row).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { Button } from '../../../components/ui';
import { colors } from '../../../theme';
import type { LeaveTypeView } from '../../../services/resources/attendanceLeave';
import { draftFromType } from './leaveTypesModel';
import { LeaveTypeEditorCard } from './LeaveTypeEditorCard';

function type(overrides: Partial<LeaveTypeView> = {}): LeaveTypeView {
  return {
    id: 't1',
    code: 'earned',
    name: 'Earned Leave',
    accrualMode: 'monthly',
    accrualDays: 1,
    carryForward: true,
    allowOverBalance: false,
    paid: true,
    enabled: true,
    configurable: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children) ? children.map(String).join('') : String(children ?? '');
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

/** The whole-row toggle pressable: a button role labelled by its title. */
function rowToggle(root: ReactTestRenderer.ReactTestInstance, title: string) {
  return root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(`${title}:`),
  )[0];
}

/** The enable row's state dot — the design's 8×8 pill (the Switch wraps a
 *  native control, so no other view carries these dims). */
function stateDots(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    node =>
      node.type === View &&
      Array.isArray(node.props.style) &&
      node.props.style.some(s => s?.width === 8 && s?.height === 8),
  );
}

const base = {
  busy: false,
  saved: false,
  error: null,
  onChange: jest.fn(),
  onSave: jest.fn(),
};

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

async function renderCard(props: {
  type: LeaveTypeView;
  draft: ReturnType<typeof draftFromType>;
  saved?: boolean;
  onChange?: jest.Mock;
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <LeaveTypeEditorCard
        type={props.type}
        draft={props.draft}
        busy={false}
        saved={props.saved ?? false}
        error={null}
        onChange={props.onChange ?? base.onChange}
        onSave={base.onSave}
      />,
    );
  });
  lastRenderer = renderer;
  return renderer.root;
}

describe('LeaveTypeEditorCard — the inert Save explains itself', () => {
  afterEach(() => {
    if (lastRenderer) {
      const renderer = lastRenderer;
      lastRenderer = null;
      act(() => renderer.unmount());
    }
  });

  it('a clean draft renders "No changes yet" under the disabled Save', async () => {
    const root = await renderCard({ type: type(), draft: draftFromType(type()) });
    // The Save button is driven BY TYPE + children (the ui Button carries
    // its label as children, not an accessibilityLabel).
    const save = root.findAllByType(Button).find(b => b.props.children === 'Save Changes')!;
    expect(save.props.disabled).toBe(true);
    expect(texts(root)).toContain('No changes yet');
    expect(texts(root)).not.toContain('Saved.');
  });

  it('a dirty draft drops the caption (the Save button is live)', async () => {
    const draft = draftFromType(type());
    draft.days = '2';
    const root = await renderCard({ type: type(), draft });
    expect(texts(root)).not.toContain('No changes yet');
  });

  it('after a save the mark is "Saved." (and only while still clean)', async () => {
    const root = await renderCard({
      type: type(),
      draft: draftFromType(type()),
      saved: true,
    });
    expect(texts(root)).toContain('Saved.');
    expect(texts(root)).not.toContain('No changes yet');
  });

  it('pressing the row flips the switch (and labels itself for screen readers)', async () => {
    const onChange = jest.fn();
    const root = await renderCard({
      type: type(),
      draft: draftFromType(type()),
      onChange,
    });
    const paid = rowToggle(root, 'Paid');
    expect(paid).toBeDefined();
    expect(paid.props.accessibilityLabel).toBe('Paid: on. Double-tap to turn off.');
    await act(async () => {
      paid.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith({ paid: false });
  });

  it('an asleep row is inert — no row pressable, the switch alone is disabled', async () => {
    const root = await renderCard({
      type: type({ enabled: false }),
      draft: draftFromType(type({ enabled: false })),
    });
    expect(rowToggle(root, 'Paid')).toBeUndefined();
    // The enable row itself is still pressable (it wakes the type).
    expect(rowToggle(root, 'Turn on this leave type')).toBeDefined();
  });

  it('a legacy remnant locks every row (read-only)', async () => {
    const legacy = type({ configurable: false, code: null, accrualMode: null });
    const root = await renderCard({ type: legacy, draft: draftFromType(legacy) });
    expect(rowToggle(root, 'Paid')).toBeUndefined();
    expect(rowToggle(root, 'Turn on this leave type')).toBeUndefined();
    expect(texts(root)).toContain('Read-only');
    // The legacy row never wakes, so it never earns the inactive tag —
    // Read-only is its one state name.
    expect(texts(root)).not.toContain('Turned off');
  });

  it('the enable row carries the design state dot — green while the draft is on', async () => {
    const root = await renderCard({ type: type(), draft: draftFromType(type()) });
    const dots = stateDots(root);
    expect(dots).toHaveLength(1);
    const style = dots[0]!.props.style as Array<{ backgroundColor?: string } | undefined>;
    expect(style.find(s => s && 'backgroundColor' in s)?.backgroundColor).toBe(
      colors.status.done.solid,
    );
    // The awake card never shows the inactive tag.
    expect(texts(root)).not.toContain('Turned off');
  });

  it('a turned-off draft quiets the dot grey and names the state in the header', async () => {
    const asleep = type({ enabled: false });
    const root = await renderCard({ type: asleep, draft: draftFromType(asleep) });
    const dots = stateDots(root);
    expect(dots).toHaveLength(1);
    const style = dots[0]!.props.style as Array<{ backgroundColor?: string } | undefined>;
    expect(style.find(s => s && 'backgroundColor' in s)?.backgroundColor).toBe(
      colors.borderSubtle,
    );
    expect(texts(root)).toContain('Turned off');
  });
});
