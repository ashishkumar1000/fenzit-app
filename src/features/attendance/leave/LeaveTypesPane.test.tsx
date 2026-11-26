/**
 * LeaveTypesPane tests (the two-tab redesign, 2026-11). The save
 * orchestration used to reach the wire with no verification between the
 * pure model and the API client — the screen suite mocked the catalog to
 * [] and the card was tested in isolation (the review's verification
 * gap, 2026-11-26). Pins here: the PATCH call shape, the server row
 * replacing the local one with the "Saved." mark, the asleep save
 * PRESERVING the held rule drafts (the model's hold contract — the pane
 * used to wipe them), a 403 refetching the catalog, and a save elsewhere
 * disabling this editor's Save.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    listCompanyLeaveTypes: jest.fn(),
    patchLeaveType: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button } from '../../../components/ui';
import { colors } from '../../../theme';
import { attendanceLeaveService } from '../../../services';
import type { LeaveTypeView } from '../../../services/resources/attendanceLeave';
import { LeaveTypesPane } from './LeaveTypesPane';

const listCompanyLeaveTypes = attendanceLeaveService.listCompanyLeaveTypes as jest.Mock;
const patchLeaveType = attendanceLeaveService.patchLeaveType as jest.Mock;

function typeRow(overrides: Partial<LeaveTypeView> = {}): LeaveTypeView {
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
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

const CATALOG = [
  typeRow(),
  typeRow({
    id: 't2',
    code: 'sick',
    name: 'Sick Leave',
    accrualMode: 'annual',
    accrualDays: 6,
  }),
];

function flatText(node: ReactTestRenderer.ReactTestInstance): string {
  const children = node.props.children;
  return Array.isArray(children)
    ? children.map(String).join('')
    : String(children ?? '');
}

function textsInOrder(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAll(n => n.type === Text).map(flatText);
}

function findByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
}

/** A node's style flattened (arrays, falsy slots and all) — Pressable
 *  styles are FUNCTIONS of the pressed state; resolve them at rest. */
function flatStyles(node: ReactTestRenderer.ReactTestInstance): Record<string, unknown>[] {
  const raw =
    typeof node.props.style === 'function'
      ? node.props.style({ pressed: false })
      : node.props.style;
  const walk = (style: unknown): Record<string, unknown>[] =>
    Array.isArray(style) ? style.flatMap(walk) : style ? [style as Record<string, unknown>] : [];
  return walk(raw);
}

function saveButton(root: ReactTestRenderer.ReactTestInstance) {
  const node = root.findAll(
    n => n.type === Button && typeof n.props.onPress === 'function',
  );
  return node;
}

async function renderPane() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(<LeaveTypesPane />);
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  });
  return renderer.root;
}

async function settle(root: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  });
  return root;
}

describe('LeaveTypesPane — the save orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listCompanyLeaveTypes.mockResolvedValue(CATALOG);
  });

  it('the catalog mounts and the configured count renders over the editable rows', async () => {
    const root = await renderPane();
    expect(textsInOrder(root)).toContain('2 configured');
    // The first type's chip + its editor card are live.
    expect(textsInOrder(root)).toContain('Earned Leave');
    expect(textsInOrder(root)).toContain('Save Changes');
  });

  it('Save posts the changed fields only and replaces the row with the server truth', async () => {
    const root = await renderPane();
    // Step the rate 1 → 1.5 (the 'Increase days' stepper button).
    await act(async () => {
      findByLabel(root, 'Increase days')[0].props.onPress();
    });
    patchLeaveType.mockResolvedValueOnce(typeRow({ accrualDays: 1.5 }));
    await act(async () => {
      saveButton(root)[0].props.onPress();
    });
    expect(patchLeaveType).toHaveBeenCalledWith('t1', { accrualDays: 1.5 });
    // The chip's annualized sub-label follows the SERVER row (1.5/mo → 18/yr).
    // RN Pressable mirrors the label onto its inner host Views (3 nodes carry
    // one chip's label) — pin DISTINCT labels, not node counts.
    expect(
      new Set(
        root.findAll(n =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Earned Leave, 18 d / yr'),
        ).map(n => n.props.accessibilityLabel as string),
      ).size,
    ).toBe(1);
    // The draft reseeded: the transient mark reads "Saved." and Save is
    // inert again.
    expect(textsInOrder(root)).toContain('Saved.');
    expect(saveButton(root)[0].props.disabled).toBe(true);
  });

  it('an asleep save posts enabled only and PRESERVES the held rule drafts', async () => {
    const root = await renderPane();
    // Draft a rule while awake, then flip the type off and save.
    await act(async () => {
      findByLabel(root, 'Increase days')[0].props.onPress();
    });
    await act(async () => {
      findByLabel(root, 'Turn on this leave type: on. Double-tap to turn off.')[0].props.onPress();
    });
    patchLeaveType.mockResolvedValueOnce(typeRow({ enabled: false }));
    await act(async () => {
      saveButton(root)[0].props.onPress();
    });
    // The wire saw the enabled change ALONE (the hold contract).
    expect(patchLeaveType).toHaveBeenCalledWith('t1', { enabled: false });
    // The drafted rate SURVIVES the reseat: the chip still shows the dirty
    // dot, and the Save explains itself instead of silently no-oping.
    // Distinct labels again — the dirty chip's label is mirrored across the
    // Pressable and its two host Views.
    expect(
      new Set(
        root.findAll(n =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.includes('unsaved changes'),
        ).map(n => n.props.accessibilityLabel as string),
      ).size,
    ).toBe(1);
    expect(textsInOrder(root)).toContain('Rule changes hold while the type is off.');
    const button = saveButton(root)[0];
    expect(button.props.disabled).toBe(true);
    // The sticky bar (raised while dirty) mirrors the card's exact gate —
    // the held draft posts nothing, so the bar's Save is disabled too.
    expect(saveButton(root)[1].props.disabled).toBe(true);
    // ...and the held rate ships with the next AWAKE save.
    await act(async () => {
      findByLabel(root, 'Turn on this leave type: off. Double-tap to turn on.')[0].props.onPress();
    });
    patchLeaveType.mockResolvedValueOnce(typeRow({ enabled: true, accrualDays: 1.5 }));
    await act(async () => {
      saveButton(root)[0].props.onPress();
    });
    expect(patchLeaveType).toHaveBeenLastCalledWith('t1', { enabled: true, accrualDays: 1.5 });
  });

  it('a 403 renders the server line AND refetches the catalog so the editor re-seats', async () => {
    const root = await renderPane();
    await act(async () => {
      findByLabel(root, 'Increase days')[0].props.onPress();
    });
    patchLeaveType.mockRejectedValueOnce({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Not allowed',
    });
    await act(async () => {
      saveButton(root)[0].props.onPress();
    });
    expect(textsInOrder(root)).toContain('Not allowed');
    expect(listCompanyLeaveTypes).toHaveBeenCalledTimes(2);
    // The draft survives the reseat (the chip's dirty marker persists;
    // distinct labels, per the mirrored-label note above).
    expect(
      new Set(
        root.findAll(n =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.includes('unsaved changes'),
        ).map(n => n.props.accessibilityLabel as string),
      ).size,
    ).toBe(1);
  });

  it('another type\'s save in flight disables THIS editor\'s Save (no silent stacked PATCH)', async () => {
    const root = await renderPane();
    // A's save hangs until the test ends.
    await act(async () => {
      findByLabel(root, 'Turn on this leave type: on. Double-tap to turn off.')[0].props.onPress();
    });
    patchLeaveType.mockImplementationOnce(() => new Promise(() => undefined));
    await act(async () => {
      saveButton(root)[0].props.onPress();
    });
    // Switch to B and draft a change there.
    await act(async () => {
      findByLabel(root, 'Sick Leave, 6 d / yr · Active')[0].props.onPress();
    });
    await act(async () => {
      findByLabel(root, 'Paid: on. Double-tap to turn off.')[0].props.onPress();
    });
    // Without the savingElsewhere gate this Save sits enabled while the
    // pane's latch would silently swallow the press.
    expect(saveButton(root)[0].props.disabled).toBe(true);
    // B is dirty, so the sticky bar is up — it mirrors the same gate.
    expect(saveButton(root)[1].props.disabled).toBe(true);
    await settle(root);
  });

  it('a dirty draft raises the sticky Save bar; a clean pane has none', async () => {
    const root = await renderPane();
    // Clean: only the card's own Save exists (tree order — the bar joins
    // AFTER it, so the card's Save stays [0] for the older assertions).
    expect(saveButton(root)).toHaveLength(1);
    expect(textsInOrder(root)).not.toContain('Unsaved changes');
    await act(async () => {
      findByLabel(root, 'Increase days')[0].props.onPress();
    });
    expect(saveButton(root)).toHaveLength(2);
    expect(textsInOrder(root)).toContain('Unsaved changes');
    // The bar names what it would save.
    expect(textsInOrder(root)).toContain('Earned Leave');
  });

  it("the sticky bar's Save posts the same PATCH as the card's and lowers once clean", async () => {
    const root = await renderPane();
    await act(async () => {
      findByLabel(root, 'Increase days')[0].props.onPress();
    });
    patchLeaveType.mockResolvedValueOnce(typeRow({ accrualDays: 1.5 }));
    const saves = saveButton(root);
    expect(saves).toHaveLength(2);
    await act(async () => {
      // The LAST Button is the sticky bar's — a save the owner can reach
      // without scrolling back up to the card.
      saves[saves.length - 1]!.props.onPress();
    });
    expect(patchLeaveType).toHaveBeenCalledWith('t1', { accrualDays: 1.5 });
    // The bar lowers with the draft clean.
    expect(saveButton(root)).toHaveLength(1);
  });

  it('a turned-off type renders the muted off-chip and the "Turned off" card', async () => {
    listCompanyLeaveTypes.mockResolvedValue([
      typeRow(),
      typeRow({
        id: 't2',
        code: 'sick',
        name: 'Sick Leave',
        accrualMode: 'annual',
        accrualDays: 6,
        enabled: false,
      }),
    ]);
    const root = await renderPane();
    // The OFF type's idle chip is sunken with a muted glyph (distinct
    // labels — the chip's label mirrors onto its host views ×3).
    const offChip = root
      .findAll(
        n =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Sick Leave') &&
          n.props.accessibilityLabel.includes('· Off'),
      )
      .filter(n => typeof n.props.onPress === 'function')[0];
    expect(offChip).toBeDefined();
    expect(flatStyles(offChip!).some(s => s.backgroundColor === colors.surfaceSunken)).toBe(true);
    expect(offChip!.findAll(n => n.props.color === colors.textMuted).length).toBeGreaterThan(0);
    // The awake idle chip stays the plain card surface (the contrast).
    const idleChip = root
      .findAll(
        n =>
          typeof n.props.accessibilityLabel === 'string' &&
          n.props.accessibilityLabel.startsWith('Earned Leave') &&
          n.props.accessibilityLabel.includes('· Active'),
      )
      .filter(n => typeof n.props.onPress === 'function')[0];
    expect(flatStyles(idleChip!).some(s => s.backgroundColor === colors.surfaceSunken)).toBe(
      false,
    );
    // Selecting it opens the asleep card, which names the state.
    await act(async () => {
      offChip!.props.onPress();
    });
    expect(textsInOrder(root)).toContain('Turned off');
    // The now-ACTIVE off chip takes the primary selection style again.
    expect(flatStyles(offChip!).some(s => s.backgroundColor === colors.primary)).toBe(true);
  });

  it('an empty catalog offers the Try again re-fetch instead of a dead end', async () => {
    listCompanyLeaveTypes.mockResolvedValue([]);
    const root = await renderPane();
    expect(textsInOrder(root)).toContain('No leave types yet');
    expect(textsInOrder(root)).toContain(
      "Your leave-type catalog hasn't been set up yet. If this looks wrong, try again.",
    );
    const retry = root.findAllByType(Button).find(b => b.props.children === 'Try again');
    expect(retry).toBeDefined();
    listCompanyLeaveTypes.mockResolvedValue(CATALOG);
    await act(async () => {
      retry!.props.onPress();
    });
    expect(listCompanyLeaveTypes).toHaveBeenCalledTimes(2);
    expect(textsInOrder(root)).toContain('2 configured');
  });

  it('a failed catalog load shows the wire message with its own retry', async () => {
    listCompanyLeaveTypes.mockRejectedValueOnce({ message: 'Network down' });
    const root = await renderPane();
    expect(textsInOrder(root)).toContain('Network down');
    const retry = root.findAllByType(Button).find(b => b.props.children === 'Try again');
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.props.onPress();
    });
    // The retry re-asks the wire and seats the catalog.
    expect(listCompanyLeaveTypes).toHaveBeenCalledTimes(2);
    expect(textsInOrder(root)).toContain('2 configured');
  });

  it('a second Try again while the first is in flight does not stack a second fetch', async () => {
    listCompanyLeaveTypes.mockResolvedValue([]);
    const root = await renderPane();
    let release!: (rows: LeaveTypeView[]) => void;
    listCompanyLeaveTypes.mockImplementationOnce(
      () =>
        new Promise<LeaveTypeView[]>(resolve => {
          release = resolve;
        }),
    );
    await act(async () => {
      const retry = root.findAllByType(Button).find(b => b.props.children === 'Try again')!;
      retry.props.onPress();
      // The in-flight latch swallows the double-tap — an out-of-order
      // resolution could otherwise seat a stale catalog (the review's
      // edge-case note, 2026-11-26).
      retry.props.onPress();
    });
    expect(listCompanyLeaveTypes).toHaveBeenCalledTimes(2); // mount + ONE retry
    await act(async () => {
      release(CATALOG);
    });
    expect(textsInOrder(root)).toContain('2 configured');
  });
});
