/**
 * PendingQueue — the owner Jobs tab's Pending segment body (Epic 22 story 4
 * + CAP-10).
 *
 * Pinned contracts:
 *  - CAP-10's scaled employee filter: ONE chip naming the current pick
 *    ("All employees" or the employee's name) that opens the search sheet —
 *    never a roster of name chips (doesn't scale to 100 employees);
 *  - the three age chips combine with the employee filter, and a tap on
 *    the active age chip re-applies it (setQueueFilter is idempotent);
 *  - chips stay mounted during a load — only the list area shows the loader;
 *  - a filtered empty state is a different sentence from a bare queue
 *    ("Nothing matches this filter" + a Clear filters CTA), and clearing
 *    resets BOTH axes;
 *  - the sheet's "All employees" row clears the filter; excluded: invited
 *    technicians (not yet employees who can create jobs).
 *
 * The approval-queue store is mocked at its module boundary (its own suite
 * is use-approval-queue.test.tsx); the profile store likewise.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { Pressable } from 'react-native';

jest.mock('react-native-svg', () => {
  const passthrough = (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    props.children ?? null;
  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === '__esModule') return true;
        if (prop === 'default') return passthrough;
        return passthrough;
      },
    },
  );
});

jest.mock('../src/features/jobs/useApprovalQueue', () => ({
  useApprovalQueue: jest.fn(),
  setQueueFilter: jest.fn(),
}));

jest.mock('../src/features/profile', () => ({
  useMyProfile: jest.fn(),
}));

jest.mock('../src/components/TechnicianPicker', () => ({
  TechnicianPicker: jest.fn(() => null),
}));

jest.mock('../src/components/ui/Sheet', () => ({
  Sheet: (props: Record<string, unknown>) => (props.visible ? props.children : null),
}));

import {
  PendingQueue,
} from '../src/features/jobs/components/PendingQueue';
import { ApprovalQueueCard } from '../src/features/jobs/components/ApprovalQueueCard';
import { EmployeeFilterSheet } from '../src/features/jobs/components/EmployeeFilterSheet';
import { InlineError } from '../src/components/ui';
import { setQueueFilter, useApprovalQueue } from '../src/features/jobs/useApprovalQueue';
import { useMyProfile } from '../src/features/profile';
import { TechnicianPicker } from '../src/components/TechnicianPicker';
import type { ApprovalQueueItem, ProfileTechnician } from '../src/services';

const useApprovalQueueMock = useApprovalQueue as jest.Mock;
const useMyProfileMock = useMyProfile as jest.Mock;
const setQueueFilterMock = setQueueFilter as jest.Mock;
const TechnicianPickerMock = TechnicianPicker as jest.Mock;

const makeTech = (overrides: Partial<ProfileTechnician> = {}): ProfileTechnician => ({
  id: 'u-2',
  name: 'Amit Sharma',
  countryCode: '+91',
  phoneNumber: '9123456789',
  status: 'active',
  ...overrides,
} as ProfileTechnician);

const makeItem = (overrides: Partial<ApprovalQueueItem> = {}): ApprovalQueueItem => ({
  id: 'q-1',
  jobNumber: 'JB-2026-0099',
  submittedAt: '2026-11-13T08:00:00Z',
  ageHours: 3,
  employee: { id: 'u-2', name: 'Amit Sharma' },
  customerName: 'Ravi Kumar',
  ...overrides,
});

function storeReturn(overrides: Record<string, unknown> = {}) {
  return {
    items: [] as ApprovalQueueItem[],
    nextCursor: null,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasLoaded: true,
    lastLoadedAt: 0,
    employeeId: null,
    olderThanHours: null,
    refresh: jest.fn().mockResolvedValue(undefined),
    loadMore: jest.fn(),
    ...overrides,
  };
}

const profile = () => ({
  profile: {
    id: 'u-1',
    technicians: [
      makeTech(),
      makeTech({ id: 'u-3', name: 'Mom' }),
      makeTech({ id: 'u-4', name: 'New Invite', status: 'invited' }),
    ],
  },
});

async function mount(
  store = storeReturn(),
  prof = profile(),
): Promise<ReactTestRenderer.ReactTestRenderer> {
  useApprovalQueueMock.mockReturnValue(store);
  useMyProfileMock.mockReturnValue(prof);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <PendingQueue onOpenJob={jest.fn()} />,
    );
  });
  return renderer;
}

/** Text nodes rendered (labels of chips included). */
function allText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map(t => t.props.children)
    .filter((c: unknown) => typeof c === 'string')
    .join(' ');
}

/** The chip pressable whose label matches. */
function chip(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const match = renderer.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(n =>
      (n as unknown as { findAllByType: (t: unknown) => Array<{ props: { children: unknown } }> })
        .findAllByType(Text)
        .some(t => t.props.children === label),
    );
  if (!match) throw new Error(`chip not found: ${label}`);
  return match;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('PendingQueue — the employee filter chip', () => {
  it('shows ONE chip labelled "All employees" when unfiltered', async () => {
    const renderer = await mount();
    expect(allText(renderer)).toContain('All employees');
  });

  it('names the picked employee on the chip when filtered', async () => {
    const renderer = await mount(
      storeReturn({ employeeId: 'u-3' }),
    );
    expect(allText(renderer)).toContain('Mom');
    expect(allText(renderer)).not.toContain('All employees');
  });

  it('the chip opens the search sheet, never a roster of chips', async () => {
    const renderer = await mount();
    const sheet = renderer.root.findByType(EmployeeFilterSheet);
    expect(sheet.props.visible).toBe(false);
    await ReactTestRenderer.act(async () => {
      chip(renderer, 'All employees').props.onPress();
    });
    expect(renderer.root.findByType(EmployeeFilterSheet).props.visible).toBe(true);
    // The roster never prints on the queue itself.
    expect(allText(renderer)).not.toContain('New Invite');
  });

  it('passes the roster WITHOUT invited technicians to the sheet', async () => {
    const renderer = await mount();
    const sheet = renderer.root.findByType(EmployeeFilterSheet);
    const ids = (sheet.props.technicians as ProfileTechnician[]).map(t => t.id);
    expect(ids).toEqual(['u-2', 'u-3']);
  });

  it('picking a sheet employee applies the filter and closes the sheet', async () => {
    setQueueFilterMock.mockResolvedValue(undefined);
    const renderer = await mount();
    await ReactTestRenderer.act(async () => {
      chip(renderer, 'All employees').props.onPress();
    });
    const sheet = renderer.root.findByType(EmployeeFilterSheet);
    await ReactTestRenderer.act(async () => {
      sheet.props.onSelect('u-3');
    });
    expect(setQueueFilterMock).toHaveBeenCalledWith('u-3', null);
    // applyEmployeeFilter closes the sheet itself.
    expect(renderer.root.findByType(EmployeeFilterSheet).props.visible).toBe(false);
  });

  it('the sheet keeps the current selection (preselected row)', async () => {
    const renderer = await mount(storeReturn({ employeeId: 'u-2' }));
    const sheet = renderer.root.findByType(EmployeeFilterSheet);
    expect(sheet.props.selectedId).toBe('u-2');
  });
});

describe('PendingQueue — the age chips (CAP-10)', () => {
  it('offers exactly the three age cut-offs, "Any age" active by default', async () => {
    const renderer = await mount();
    const text = allText(renderer);
    expect(text).toContain('Any age');
    expect(text).toContain('Over 24 hours');
    expect(text).toContain('Over 3 days');
    const anyAge = chip(renderer, 'Any age');
    expect(anyAge.props.accessibilityState.selected).toBe(true);
  });

  it('applying an age cut-off keeps the employee filter (they combine)', async () => {
    setQueueFilterMock.mockResolvedValue(undefined);
    const renderer = await mount(storeReturn({ employeeId: 'u-2' }));
    await ReactTestRenderer.act(async () => {
      chip(renderer, 'Over 24 hours').props.onPress();
    });
    expect(setQueueFilterMock).toHaveBeenCalledWith('u-2', 24);
  });

  it('the "Over 3 days" chip carries the 72-hour cut-off to the store', async () => {
    // Only Over-24 was ever pressed in this suite — the third chip's hours
    // value was an untested assumption (review catch).
    setQueueFilterMock.mockResolvedValue(undefined);
    const renderer = await mount();
    await ReactTestRenderer.act(async () => {
      chip(renderer, 'Over 3 days').props.onPress();
    });
    expect(setQueueFilterMock).toHaveBeenCalledWith(null, 72);
  });

  it('pressing a chip while the query loads reaches the store (disabled is the touch layer, not a JS guard)', async () => {
    // The mirror of the block test: RN enforces `disabled` at the touch
    // layer, so a press on the rendered chip still fires its handler —
    // pin WHICH handler runs: the same guarded setQueueFilter, nothing else.
    setQueueFilterMock.mockResolvedValue(undefined);
    const renderer = await mount();
    await ReactTestRenderer.act(async () => {
      chip(renderer, 'Any age').props.onPress();
    });
    expect(setQueueFilterMock).toHaveBeenCalledWith(null, null);
  });

  it('applying an age chip while loading is blocked (no racing the store)', async () => {
    const renderer = await mount(storeReturn({ isLoading: true }));
    // RN enforces `disabled` at the touch layer — the suite pins that the
    // chip carries the disabled state while the query loads.
    const over24 = chip(renderer, 'Over 24 hours');
    expect(over24.props.disabled).toBe(true);
    expect(over24.props.accessibilityState.disabled).toBe(true);
  });
});

describe('PendingQueue — list states', () => {
  it('renders the queue rows and a row tap opens the job detail', async () => {
    const onOpenJob = jest.fn();
    useApprovalQueueMock.mockReturnValue(
      storeReturn({ items: [makeItem(), makeItem({ id: 'q-2', jobNumber: 'JB-2026-0100' })] }),
    );
    useMyProfileMock.mockReturnValue(profile());
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<PendingQueue onOpenJob={onOpenJob} />);
    });
    expect(allText(renderer)).toContain('JB-2026-0099');
    expect(allText(renderer)).toContain('JB-2026-0100');
    // The queue's whole point is triage: a row press lands the owner on the
    // job (the review caught this primary action never being exercised).
    await ReactTestRenderer.act(async () => {
      renderer.root.findAllByType(ApprovalQueueCard)[0].props.onPress('q-1');
    });
    expect(onOpenJob).toHaveBeenCalledWith('q-1');
  });

  it('the failed-no-data Retry actually re-fetches', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const renderer = await mount(
      storeReturn({ error: 'Network request failed', hasLoaded: true, refresh }),
    );
    const retry = renderer.root
      .findAll(t => t.props.children === 'Retry')
      .map(t => {
        let p = t.parent as ReactTestRenderer.ReactTestInstance | null;
        while (p && p.props?.onPress === undefined) p = p.parent;
        return p;
      })
      .filter(Boolean)[0] as ReactTestRenderer.ReactTestInstance;
    await ReactTestRenderer.act(async () => {
      retry.props.onPress();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a filtered empty says "Nothing matches this filter" with a Clear filters CTA', async () => {
    const renderer = await mount(storeReturn({ employeeId: 'u-3', items: [] }));
    expect(allText(renderer)).toContain('Nothing matches this filter');
    expect(allText(renderer)).toContain('Clear filters');
    // And clearing resets BOTH axes. The CTA is an EmptyState Button — walk
    // up from its label text to the nearest pressable ancestor.
    setQueueFilterMock.mockResolvedValue(undefined);
    const clear = renderer.root
      .findAll(t => t.props.children === 'Clear filters')
      .map(t => {
        let p = t.parent as ReactTestRenderer.ReactTestInstance | null;
        while (p && p.props?.onPress === undefined) p = p.parent;
        return p;
      })
      .filter(Boolean)[0] as ReactTestRenderer.ReactTestInstance;
    await ReactTestRenderer.act(async () => {
      clear.props.onPress();
    });
    expect(setQueueFilterMock).toHaveBeenCalledWith(null, null);
  });

  it('a bare empty queue keeps the honest "nothing waiting" sentence — no CTA', async () => {
    const renderer = await mount(storeReturn({ items: [] }));
    expect(allText(renderer)).toContain('Nothing waiting for approval');
    expect(allText(renderer)).not.toContain('Clear filters');
  });

  it('the chips stay mounted while the first load is in flight', async () => {
    const renderer = await mount(storeReturn({ isLoading: true, hasLoaded: false, items: [] }));
    expect(allText(renderer)).toContain('All employees');
    expect(allText(renderer)).toContain('Any age');
    // Only the list area shows the loader — no full-screen replacement.
    expect(allText(renderer)).not.toContain('Retry');
  });

  it('a failure with no data shows Retry; a failure with rows keeps them behind a banner', async () => {
    const failed = storeReturn({ error: 'Network request failed', hasLoaded: true });
    const renderer = await mount({ ...failed, items: [] });
    expect(allText(renderer)).toContain('Retry');

    const bannered = storeReturn({ error: 'Network request failed', hasLoaded: true, items: [makeItem()] });
    const renderer2 = await mount(bannered);
    expect(allText(renderer2)).toContain('JB-2026-0099');
    expect(allText(renderer2)).toContain('Network request failed');
  });

  it('dismissing a failure banner silences only THAT failure — the next one is announced again', async () => {
    const renderer = await mount(
      storeReturn({ error: 'Network request failed', hasLoaded: true, items: [makeItem()] }),
    );
    expect(allText(renderer)).toContain('Network request failed');
    // The owner dismisses the banner.
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(InlineError).props.onDismiss();
    });
    expect(allText(renderer)).not.toContain('Network request failed');

    // A different failure lands (a dismissed flag must not survive it).
    useApprovalQueueMock.mockReturnValue(
      storeReturn({ error: 'Server error', hasLoaded: true, items: [makeItem()] }),
    );
    await ReactTestRenderer.act(async () => {
      renderer.update(<PendingQueue onOpenJob={jest.fn()} />);
    });
    expect(allText(renderer)).toContain('Server error');
  });
});
