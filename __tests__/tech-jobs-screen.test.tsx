/**
 * TechJobsScreen — the employee's Jobs tab (Epic 22 story 22-7 rework,
 * 2026-11-13): four equal segments (Today / Upcoming / Overdue / History),
 * the amber PendingJobsRow as the Pending entry (NOT a fifth segment), the
 * fail-hidden "Add job" button, and the one-shot scope param.
 *
 * Pinned contracts:
 *  - the amber row is COUNT-GATED on `profile.jobCounts.pending` (additive
 *    on the BE — an older cached profile omits it → hidden), except while
 *    the Pending list itself is open, where it stays as "you are here";
 *  - tapping the amber row opens `scope=all` + the pending_approval filter;
 *  - while Pending is open NO segment is active and the chips are hidden;
 *  - History narrows the chips; Today keeps its five;
 *  - "Add job" renders only when `canCreateJobs === true` (fail-hidden).
 *
 * The stores are mocked at their module boundaries — this suite pins the
 * screen's gating and routing, not the stores' internals (each store has
 * its own suite).
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { Pressable } from 'react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSetParams = jest.fn();
const focusEffects: Array<() => void> = [];
let mockRouteParams: Record<string, unknown> | undefined = undefined;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    focusEffects.push(effect);
  },
}));

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

jest.mock('../src/features/jobs/useJobs', () => ({
  useJobs: jest.fn(),
}));

jest.mock('../src/features/customers', () => ({
  useCustomers: () => ({ customers: [] }),
}));

jest.mock('../src/features/profile', () => ({
  loadMyProfile: jest.fn(),
  useMyProfile: jest.fn(),
}));

jest.mock('../src/features/notifications', () => ({
  useNotifications: () => ({ unreadCount: null, loadUnreadCount: jest.fn() }),
}));

jest.mock('../src/hooks', () => ({
  useNow: () => '2026-11-13T10:00:00.000Z',
}));

import TechJobsScreen from '../src/features/technicianApp/TechJobsScreen';
import { PendingJobsRow } from '../src/features/technicianApp/components/PendingJobsRow';
import { useJobs } from '../src/features/jobs/useJobs';
import { useMyProfile, loadMyProfile } from '../src/features/profile';
import type { ApiJob } from '../src/services';

const loadMyProfileMock = loadMyProfile as jest.Mock;

const useJobsMock = useJobs as jest.Mock;
const useMyProfileMock = useMyProfile as jest.Mock;

const makeJob = (overrides: Partial<ApiJob> = {}): ApiJob => ({
  id: 'j-1',
  jobNumber: 'JB-2026-0001',
  tenantId: 't1',
  customerId: 'c1',
  technicianId: 't1',
  serviceLocation: 'Chennai',
  skill: { id: 's-1', name: 'Plumbing' },
  scheduledStart: '2026-11-13T10:00:00.000Z',
  scheduledEnd: null,
  status: 'scheduled',
  currentStep: null,
  priority: 'normal',
  requireCompletionPhoto: false,
  requireCompletionSignature: false,
  description: null,
  notesForTechnician: null,
  createdAt: '2026-11-13T09:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-11-13T09:00:00.000Z',
  ...overrides,
});

/** The store snapshot the screen renders — defaults to a settled Today list. */
function useJobsReturn(overrides: Record<string, unknown> = {}) {
  return {
    jobs: [makeJob()],
    filter: 'all',
    scope: 'today',
    isLoading: false,
    isLoadingMore: false,
    error: null,
    loadJobs: jest.fn(),
    loadMoreJobs: jest.fn(),
    refresh: jest.fn().mockResolvedValue(undefined),
    setFilter: jest.fn(),
    ...overrides,
  };
}

function profileReturn(overrides: Record<string, unknown> = {}) {
  return {
    profile: {
      id: 'u-2',
      name: 'Amit Sharma',
      canCreateJobs: true,
      jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 0, cancelled: 0, pending: 0 },
      ...overrides,
    },
  };
}

async function mountScreen(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(TechJobsScreen, {
        // Tab screens receive navigation/route as props; the hooks used by
        // the parent navigators aren't in play under the test renderer.
        navigation: { navigate: mockNavigate, goBack: mockGoBack, setParams: mockSetParams },
        route: { key: 'History', name: 'History', params: mockRouteParams },
      } as never),
    );
  });
  return renderer;
}

function allText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map(t => {
      const c = t.props.children;
      if (typeof c === 'string' || typeof c === 'number') return String(c);
      if (Array.isArray(c)) {
        return c.filter((x: unknown) => typeof x === 'string' || typeof x === 'number').join('');
      }
      return '';
    })
    .join(' ');
}

function pendingRow(
  root: ReactTestRenderer.ReactTestRenderer['root'],
): ReactTestRenderer.ReactTestInstance | undefined {
  return root.findAllByType(PendingJobsRow)[0];
}

afterEach(() => {
  ReactTestRenderer.act(() => {
    focusEffects.length = 0;
  });
  mockRouteParams = undefined;
  jest.clearAllMocks();
});

describe('TechJobsScreen — the amber Pending row', () => {
  it('hides the row when nothing waits (pending count 0 or absent)', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(profileReturn({ jobCounts: undefined }));
    const renderer = await mountScreen();
    expect(pendingRow(renderer.root)).toBeUndefined();
    // And the copy never lies about waiting either.
    expect(allText(renderer)).not.toContain('waiting for approval');
  });

  it('hides the row when the profile has pending 0 explicitly', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(profileReturn());
    const renderer = await mountScreen();
    expect(pendingRow(renderer.root)).toBeUndefined();
  });

  it('shows the row when jobs actually wait (pending > 0)', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(
      profileReturn({ jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 0, cancelled: 0, pending: 2 } }),
    );
    const renderer = await mountScreen();
    expect(pendingRow(renderer.root)).toBeDefined();
    expect(allText(renderer)).toContain('waiting for approval');
    expect(pendingRow(renderer.root)!.props.active).toBe(false);
  });

  it('an older backend WITHOUT the pending field hides the row (additive-safe)', async () => {
    // `pending` is additive on the BE: the screen must treat its absence as
    // zero, never as undefined-comparison truthiness. The jobCounts object
    // must genuinely LACK the key — the default fixture's `pending: 0`
    // would make this test a byte-for-byte duplicate of the zero case.
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(
      profileReturn({
        jobCounts: { today: 1, upcoming: 2, overdue: 0, completed: 0, cancelled: 0 },
      }),
    );
    const renderer = await mountScreen();
    expect(pendingRow(renderer.root)).toBeUndefined();
  });

  it('stays visible as "you are here" while the Pending list is open, even at 0', async () => {
    useJobsMock.mockReturnValue(useJobsReturn({ scope: 'all', filter: 'pending_approval' }));
    useMyProfileMock.mockReturnValue(profileReturn());
    const renderer = await mountScreen();
    expect(pendingRow(renderer.root)).toBeDefined();
    expect(pendingRow(renderer.root)!.props.active).toBe(true);
  });

  it('tapping the row loads the Pending list (scope all + fixed filter)', async () => {
    const loadJobs = jest.fn();
    useJobsMock.mockReturnValue(useJobsReturn({ loadJobs }));
    useMyProfileMock.mockReturnValue(
      profileReturn({ jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0, pending: 1 } }),
    );
    const renderer = await mountScreen();
    await ReactTestRenderer.act(async () => {
      pendingRow(renderer.root)!.props.onPress();
    });
    expect(loadJobs).toHaveBeenCalledWith('all', 'pending_approval');
  });
});

describe('TechJobsScreen — the segments', () => {  it('shows exactly the four segments, never Pending as a fifth tab', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(profileReturn());
    const renderer = await mountScreen();
    const text = allText(renderer);
    for (const label of ['Today', 'Upcoming', 'Overdue', 'History']) {
      expect(text).toContain(label);
    }
    // Pending is the amber row, not a tab label. Split on whitespace: an
    // allText-joined negative like `not.toContain('Pending\n')` can never
    // fire (nodes join with spaces), but a fifth "Pending" segment would
    // surface as the WORD — which this catches.
    expect(text.split(/\s+/)).not.toContain('Pending');
  });

  it('shows NO active segment while the Pending list is open', async () => {
    useJobsMock.mockReturnValue(useJobsReturn({ scope: 'all', filter: 'pending_approval' }));
    useMyProfileMock.mockReturnValue(profileReturn());
    const renderer = await mountScreen();
    // The control's value prop reads 'pending', which no segment offers.
    const control = renderer.root
      .findAll(n => typeof n.type === 'function' && Array.isArray(n.props.options))
      .find(n => n.props.value !== undefined);
    expect(control?.props.value).toBe('pending');
    expect(control?.props.options.map((o: { value: string }) => o.value)).toEqual([
      'today',
      'upcoming',
      'overdue',
      'history',
    ]);
  });

  it('badges the Overdue segment with the server count when overdue > 0', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(
      profileReturn({ jobCounts: { today: 0, upcoming: 0, overdue: 3, completed: 0, cancelled: 0, pending: 0 } }),
    );
    const renderer = await mountScreen();
    const control = renderer.root
      .findAll(n => typeof n.type === 'function' && Array.isArray(n.props.options))
      .find(n => n.props.value !== undefined);
    const overdue = control?.props.options.find((o: { value: string }) => o.value === 'overdue');
    expect(overdue.badge).toBe(3);
  });
});

describe('TechJobsScreen — the status chips', () => {
  it('hides the chip row in Upcoming, Overdue and Pending scopes', async () => {
    for (const scope of ['upcoming', 'overdue', 'all'] as const) {
      const filter = scope === 'all' ? 'pending_approval' : 'all';
      useJobsMock.mockReturnValue(useJobsReturn({ scope, filter }));
      useMyProfileMock.mockReturnValue(profileReturn());
      const renderer = await mountScreen();
      expect(allText(renderer)).not.toContain('Rejected');
      ReactTestRenderer.act(() => {
        renderer.unmount();
      });
    }
  });

  it('keeps the Rejected chip only in History', async () => {
    useJobsMock.mockReturnValue(useJobsReturn({ scope: 'history' }));
    useMyProfileMock.mockReturnValue(profileReturn());
    const renderer = await mountScreen();
    expect(allText(renderer)).toContain('Rejected');
  });
});

describe('TechJobsScreen — the create entry', () => {
  it('shows "Add job" only when canCreateJobs is exactly true', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(profileReturn({ canCreateJobs: true }));
    const renderer = await mountScreen();
    expect(allText(renderer)).toContain('Add job');
  });

  it('hides "Add job" when the flag is false or absent (fail-hidden)', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(profileReturn({ canCreateJobs: false }));
    const renderer = await mountScreen();
    expect(allText(renderer)).not.toContain('Add job');
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    useMyProfileMock.mockReturnValue(profileReturn({ canCreateJobs: undefined }));
    const renderer2 = await mountScreen();
    expect(allText(renderer2)).not.toContain('Add job');
  });

  it('Add job opens TechNewJob, never the owner create screen', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(profileReturn({ canCreateJobs: true }));
    const renderer = await mountScreen();
    // The pill Button carries no accessibilityLabel, and the string
    // "Add job" appears in non-interactive text too — walk up from EACH
    // occurrence to its nearest pressable ancestor and keep the one found.
    const pressables = renderer.root
      .findAll(t => t.props.children === 'Add job')
      .map(t => {
        let p = t.parent as ReactTestRenderer.ReactTestInstance | null;
        while (p && p.props?.onPress === undefined) p = p.parent;
        return p;
      })
      .filter(Boolean);
    const pressable = pressables[0] as ReactTestRenderer.ReactTestInstance;
    expect(pressable).toBeTruthy();
    await ReactTestRenderer.act(async () => {
      pressable!.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('TechNewJob');
    expect(mockNavigate).not.toHaveBeenCalledWith('NewJob');
  });
});

describe('TechJobsScreen — the one-shot deep-link param (My-jobs tiles)', () => {
  /** The suite's useFocusEffect mock only COLLECTS effects; run them the
   *  way the navigator would (the panel review caught that a collected
   *  effect that never fires pins nothing). */
  async function runFocusEffects(): Promise<void> {
    await ReactTestRenderer.act(async () => {
      focusEffects.splice(0).forEach(effect => effect());
    });
  }

  it('a Pending-tile deep link loads the Pending list and clears both params', async () => {
    const loadJobs = jest.fn();
    useJobsMock.mockReturnValue(useJobsReturn({ loadJobs }));
    useMyProfileMock.mockReturnValue(profileReturn());
    mockRouteParams = { scope: 'pending' };
    await mountScreen();
    await runFocusEffects();
    expect(loadJobs).toHaveBeenCalledWith('all', 'pending_approval');
    expect(mockSetParams).toHaveBeenCalledWith({ scope: undefined, filter: undefined });
  });

  it('a Rejected-tile deep link loads History with the rejected filter', async () => {
    const loadJobs = jest.fn();
    useJobsMock.mockReturnValue(useJobsReturn({ loadJobs }));
    useMyProfileMock.mockReturnValue(profileReturn());
    mockRouteParams = { scope: 'history', filter: 'rejected' };
    await mountScreen();
    await runFocusEffects();
    expect(loadJobs).toHaveBeenCalledWith('history', 'rejected');
    expect(mockSetParams).toHaveBeenCalledWith({ scope: undefined, filter: undefined });
  });

  it('a plain focus refreshes the profile (the amber row count must not be a login snapshot)', async () => {
    useJobsMock.mockReturnValue(useJobsReturn());
    useMyProfileMock.mockReturnValue(profileReturn());
    mockRouteParams = undefined;
    await mountScreen();
    loadMyProfileMock.mockClear();
    await runFocusEffects();
    expect(loadMyProfileMock).toHaveBeenCalled();
  });
});
