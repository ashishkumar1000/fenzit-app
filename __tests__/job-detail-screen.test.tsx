/**
 * JobDetailScreen's fetch/state branches (AC 1, 5, 6) plus the actions slot
 * and the cancel flow (Story 1-3): fetch on mount with the route's jobId, a
 * centered spinner (never a flash of empty content), the not-available view
 * on 404 (and 403), the edit/cancel actions for scheduled jobs only, the
 * cancel PATCH payload, and the cancel failure feedback.
 *
 * Navigation hooks are stubbed (the route/navigate shape is static), and the
 * services + profile layers are mocked at the module boundary — the screen's
 * logic under test is its state machine, not the client.
 */
// The real session is empty in this test, so the role hooks are pinned:
// a company admin by default, a viewer where a test flips `mockCanWrite`.
let mockCanWrite = true;
jest.mock('../src/features/auth/useRole', () => ({
  ...jest.requireActual('../src/features/auth/useRole'),
  useCanWrite: () => mockCanWrite,
  useSessionRole: () => (mockCanWrite ? 'company_admin' : 'viewer'),
}));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View, type AlertButton, type StyleProp, type ViewStyle } from 'react-native';
import { ConfirmDialog } from '../src/components/ui';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    canGoBack: jest.fn(() => true),
    navigate: mockNavigate,
  }),
  useRoute: () => ({ params: { jobId: 'j-1' } }),
}));

jest.mock('../src/services', () => ({
  jobService: { getById: jest.fn(), update: jest.fn(), decidePending: jest.fn() },
  // The REAL merge helper, not a stub: the screen applies mutation responses
  // through it. Its module is type-import-only (no api client/MMKV chain),
  // so requireActual stays noise-free here.
  mergeJobIntoDetail:
    jest.requireActual('../src/services/jobDetailMerge')
      .mergeJobIntoDetail,
}));

// The profile feature (roster store + phone formatting) is mocked whole —
// its real modules pull in the services barrel and MMKV, which would add
// unrelated request noise to every test.
jest.mock('../src/features/profile', () => ({
  useMyProfile: () => ({ profile: null }),
  loadMyProfile: jest.fn(),
  formatPhone: (person: { countryCode?: string | null; phoneNumber?: string | null }) =>
    `${person?.countryCode ?? ''} ${person?.phoneNumber ?? ''}`.trim(),
}));

import JobDetailScreen from '../src/features/jobDetail/JobDetailScreen';
import { RejectJobSheet } from '../src/features/jobDetail/components/RejectJobSheet';
import { Button, InlineError } from '../src/components/ui';
import { jobService } from '../src/services';
import { loadMyProfile } from '../src/features/profile';
import type { ApiError, ApiJob, JobDetail } from '../src/services';

// The Pending queue store is mocked at its module boundary: the decision
// flow's contract with it is "drop the decided row", asserted here — the
// store's own behaviour is use-approval-queue.test.tsx's job.
const mockRemoveApprovalQueueItem = jest.fn();
jest.mock('../src/features/jobs/useApprovalQueue', () => ({
  // Lazy getter: the factory evaluates while the imports load, before the
  // const below is initialized — an eager reference would break the mock.
  get removeApprovalQueueItem() {
    return mockRemoveApprovalQueueItem;
  },
}));

const getById = jobService.getById as jest.Mock;
const update = jobService.update as jest.Mock;
const decidePending = jobService.decidePending as jest.Mock;
const loadMyProfileMock = loadMyProfile as jest.Mock;

function makeDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'j-1',
    jobNumber: 'JB-2026-0042',
    tenantId: 't1',
    customerId: 'c1',
    technicianId: 't1',
    serviceLocation: '12 Anna Nagar, Chennai',
    skill: { id: 'skill-plumbing', name: 'Plumbing' },
    scheduledStart: '2026-09-03T10:00:00Z',
    scheduledEnd: null,
    status: 'in_progress',
    currentStepIndex: 2,
    currentStep: 'in_progress',
    priority: 'urgent',
    requireCompletionPhoto: false,
    requireCompletionSignature: false,
    workflowTemplate: {
      version: 1,
      steps: [
        { key: 'on_my_way', label: 'On my way', advancesOn: null, requiresPhoto: false, requiresSignature: false, requiresLocation: false, setsStatus: null },
        { key: 'arrived', label: 'Arrived at site', advancesOn: null, requiresPhoto: false, requiresSignature: false, requiresLocation: false, setsStatus: null },
        { key: 'in_progress', label: 'In progress', advancesOn: null, requiresPhoto: false, requiresSignature: false, requiresLocation: false, setsStatus: null },
        { key: 'photos_uploaded', label: 'Photos uploaded', advancesOn: 'photo_confirm', requiresPhoto: true, requiresSignature: false, requiresLocation: false, setsStatus: null },
        { key: 'signature_captured', label: 'Customer signature', advancesOn: null, requiresPhoto: false, requiresSignature: true, requiresLocation: false, setsStatus: null },
        { key: 'completed', label: 'Completed', advancesOn: null, requiresPhoto: false, requiresSignature: false, requiresLocation: false, setsStatus: 'done' },
      ],
    },
    description: 'Leaking tap in the kitchen',
    notesForTechnician: 'Ring the bell twice',
    createdAt: '2026-09-03T09:00:00Z',
    completedAt: null,
    updatedAt: '2026-09-03T09:30:00Z',
    technician: {
      id: 't1',
      name: 'Anil Kumar',
      countryCode: '+91',
      phoneNumber: '9000000001',
      skills: ['Plumbing', 'AC repair'],
    },
    customer: {
      id: 'c1',
      name: 'Ravi Kumar',
      countryCode: '+91',
      phoneNumber: '9000000002',
      address: '12 Anna Nagar',
      city: 'Chennai',
      latitude: null,
      longitude: null,
      addressDetails: null,
  formattedAddress: null,
    },
    activityLog: [
      {
        id: 'l1',
        eventType: 'job_created',
        actorId: 'u1',
        metadata: null,
        createdAt: '2026-09-03T09:00:00Z',
      },
      {
        id: 'l2',
        eventType: 'step_on_my_way',
        actorId: 't1',
        metadata: null,
        createdAt: '2026-09-03T09:30:00Z',
      },
      {
        id: 'l3',
        eventType: 'brand_new_event',
        actorId: 't1',
        metadata: null,
        createdAt: '2026-09-03T09:40:00Z',
      },
    ],
    attachments: [
      {
        id: 'a1',
        type: 'photo',
        url: 'https://r2.example/p1.jpg',
        createdAt: '2026-09-03T09:50:00Z',
      },
      {
        id: 'a2',
        type: 'photo',
        url: null,
        createdAt: '2026-09-03T09:51:00Z',
      },
      {
        id: 'a3',
        type: 'signature',
        url: 'https://r2.example/sig.png',
        createdAt: '2026-09-03T09:52:00Z',
      },
    ],
    ...overrides,
  };
}

/** All rendered text strings, document order. */
function renderedText(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestRendererJSON): void => {
    if (node.type === 'Text') {
      const direct = (node.children ?? []).filter(
        (c): c is string => typeof c === 'string',
      );
      if (direct.length) out.push(direct.join(''));
    }
    (node.children ?? []).forEach(child => {
      if (typeof child !== 'string') walk(child);
    });
  };
  const json = renderer.toJSON();
  const roots = Array.isArray(json) ? json : json ? [json] : [];
  roots.forEach(root => (typeof root === 'string' ? undefined : walk(root)));
  return out;
}

async function mountScreen(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(React.createElement(JobDetailScreen));
  });
  return renderer;
}

/** The mutation response is a bare ApiJob row (no relations/log/attachments). */
function toApiJob(detail: JobDetail): ApiJob {
  return {
    id: detail.id,
    jobNumber: detail.jobNumber,
    tenantId: detail.tenantId,
    customerId: detail.customerId,
    technicianId: detail.technicianId,
    serviceLocation: detail.serviceLocation,
    scheduledStart: detail.scheduledStart,
    scheduledEnd: detail.scheduledEnd,
    status: detail.status,
    currentStepIndex: detail.currentStepIndex,
    currentStep: detail.currentStep,
    priority: detail.priority,
    requireCompletionPhoto: detail.requireCompletionPhoto,
    requireCompletionSignature: detail.requireCompletionSignature,
    skill: detail.skill,
    description: detail.description,
    notesForTechnician: detail.notesForTechnician,
    createdAt: detail.createdAt,
    completedAt: detail.completedAt,
    updatedAt: detail.updatedAt,
  };
}

/** Confirms the native cancel dialog by firing its destructive button. */
function confirmDialogs(): jest.SpyInstance {
  return jest.spyOn(Alert, 'alert').mockImplementation(
    (
      _title?: string | null,
      _message?: string | null | { text: string },
      buttons?: AlertButton[],
    ) => {
      buttons?.find(b => b.style === 'destructive')?.onPress?.();
    },
  );
}

/** The ConfirmDialogs currently PRESENTED (a Modal keeps children composed
 *  while invisible — presence reads props.visible, never existence). */
function upDialogs(root: ReactTestRenderer.ReactTestInstance) {
  return (
    root.findAllByType(ConfirmDialog) as unknown as Array<{
      props: { visible: boolean; title: string; message: unknown; onConfirm: () => void; onCancel: () => void };
    }>
  ).filter(d => d.props.visible === true);
}

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

it('fetches on mount with the route param and renders the full detail', async () => {
  getById.mockResolvedValue(makeDetail());
  const renderer = await mountScreen();

  expect(getById).toHaveBeenCalledWith('j-1', expect.anything());

  const text = renderedText(renderer);
  expect(text).toContain('Ravi Kumar'); // back-header title = the customer's name (loaded)
  expect(text).toContain('Urgent');
  expect(text).toContain('In Progress');
  expect(text).toContain('PROGRESS'); // the workflow card's renamed label
  expect(text).toContain('Plumbing'); // skill name
  expect(text).toContain('Skills'); // the muted label above the skill chips
  expect(text).toContain('Step 3 of 6 — In progress'); // current step line
  expect(text).toContain('Leaking tap in the kitchen'); // description
  expect(text).toContain('Notes for employee');
  expect(text).toContain('Ring the bell twice'); // notes body
  expect(text).toContain('Customer');
  expect(text).toContain('Ravi Kumar');
  expect(text).toContain('Employee');
  expect(text).toContain('Anil Kumar');
  expect(text).toContain('AC repair'); // skills render as individual chips
  expect(text).toContain('Photos & signature');
  expect(text).toContain('Customer signature');
  expect(text).toContain('Activity Timeline');
  expect(text).toContain('Job created'); // oldest event first
  expect(text).toContain('On my way');
  expect(text).toContain('brand_new_event'); // unknown type passes through raw
});

it('renders skill chips in an uncapped wrap container (a capped chips box painted over the action buttons on device)', async () => {
  getById.mockResolvedValue(makeDetail());
  const renderer = await mountScreen();

  // Locate the chips box via the Skills caption's sibling row, then pin the
  // style contract: chips wrap and NOTHING caps their height — RN children
  // overflow visibly past a capped container, so the old `maxHeight` cap
  // painted the third chip row straight over Call/Directions.
  const skillsCaption = renderer.root
    .findAllByType(Text)
    .find(t => t.props.children === 'Skills');
  expect(skillsCaption).toBeDefined();
  const chipsBox = skillsCaption!
    .parent!.findAllByType(View)
    .find(
      v =>
        StyleSheet.flatten(v.props.style as StyleProp<ViewStyle>)?.flexWrap ===
        'wrap',
    );
  expect(chipsBox).toBeDefined();
  const style = StyleSheet.flatten(
    chipsBox!.props.style as StyleProp<ViewStyle>,
  );
  expect(style?.flexWrap).toBe('wrap');
  expect(style?.maxHeight).toBeUndefined();
});

it('shows a centered spinner while loading, never a flash of empty content', async () => {
  let release!: (value?: unknown) => void;
  getById.mockImplementationOnce(
    () => new Promise(res => (release = () => res(makeDetail()))),
  );

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(JobDetailScreen));
    });

    expect(renderer.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(ScrollView).length).toBe(0);
    expect(renderedText(renderer)).not.toContain('Customer');
  } finally {
    await ReactTestRenderer.act(async () => {
      release();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  }
});

it('renders the not-available view on a 404', async () => {
  getById.mockRejectedValue(
    Object.assign(new Error('Not found'), {
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
    } satisfies Partial<ApiError>),
  );
  const renderer = await mountScreen();

  const text = renderedText(renderer);
  expect(text).toContain("This job isn't available");
  expect(text).toContain('It may have been removed or reassigned.');
  expect(renderer.root.findAllByType(ScrollView).length).toBe(0);

  // "Go back" pops the screen.
  const goBackButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Go back');
  expect(goBackButton).toBeDefined();
  await ReactTestRenderer.act(async () => {
    goBackButton!.props.onPress();
  });
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('renders the not-available view on a 403 too', async () => {
  getById.mockRejectedValue(
    Object.assign(new Error('Forbidden'), {
      status: 403,
      code: 'FORBIDDEN',
    } satisfies Partial<ApiError>),
  );
  const renderer = await mountScreen();

  expect(renderedText(renderer)).toContain("This job isn't available");
});

it('renders an inline error + Retry on a non-404 failure', async () => {
  getById.mockRejectedValue(
    Object.assign(new Error('Server down'), {
      status: 500,
      code: 'SERVER_ERROR',
    } satisfies Partial<ApiError>),
  );
  const renderer = await mountScreen();

  expect(renderedText(renderer)).toContain('Server down');
  expect(
    renderer.root.findAllByType(Button).some(b => b.props.children === 'Retry'),
  ).toBe(true);
});

it('pull-to-refresh refetches the detail', async () => {
  getById.mockResolvedValue(makeDetail());
  const renderer = await mountScreen();
  expect(getById).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(RefreshControl).props.onRefresh();
  });

  expect(getById).toHaveBeenCalledTimes(2);
  // The refetch carries an abort signal now too (cancelled on unmount) and no
  // spinner swap — content stays on screen under the RefreshControl spinner.
  expect(getById).toHaveBeenLastCalledWith('j-1', expect.anything());
  // Scope to the detail's own ScrollView (the one carrying the RefreshControl):
  // the EditJobSheet stays mounted while closed (TrueSheet must not be
  // unmounted mid-present) and its mocked sheet adds another ScrollView here.
  expect(
    renderer.root
      .findAllByType(ScrollView)
      .filter(scrollView => scrollView.props.refreshControl).length,
  ).toBe(1);
});

it('keeps the loaded content when a refresh fails', async () => {
  getById.mockResolvedValueOnce(makeDetail());
  const renderer = await mountScreen();

  getById.mockRejectedValueOnce(
    Object.assign(new Error('Offline'), { status: 0, code: 'NETWORK_ERROR' }),
  );
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(RefreshControl).props.onRefresh();
  });

  // Spec §3: existing content stays on screen under the RefreshControl
  // spinner — a failed refresh must not swap it for the error view. Scoped to
  // the detail's RefreshControl-carrying ScrollView (the closed EditJobSheet
  // stays mounted and its mocked sheet adds another ScrollView here).
  expect(
    renderer.root
      .findAllByType(ScrollView)
      .filter(scrollView => scrollView.props.refreshControl).length,
  ).toBe(1);
  expect(renderedText(renderer)).toContain('Ravi Kumar');
  expect(renderer.root.findAllByType(InlineError).length).toBe(0);
  expect(renderedText(renderer).some(t => t.includes('Offline'))).toBe(false);
});

it('renders no progress line for an unknown currentStep (no "Step 0" nonsense)', async () => {
  getById.mockResolvedValue(
    makeDetail({ currentStep: 'something_new' as JobDetail['currentStep'] }),
  );
  const renderer = await mountScreen();

  // renderText returns text nodes, so containment is checked per node.
  const text = renderedText(renderer);
  expect(text.some(t => t.includes('Step 0'))).toBe(false);
  expect(text.some(t => t.includes('undefined'))).toBe(false);
  // The unknown step renders nowhere — the whole line stays hidden.
  expect(text.some(t => t.includes('something_new'))).toBe(false);
});

it('ignores a raw fetch AbortError instead of rendering a failure', async () => {
  getById.mockRejectedValueOnce(
    Object.assign(new Error('Aborted'), { name: 'AbortError', status: 0 }),
  );
  const renderer = await mountScreen();

  // The abort is the app's own doing — no error view, no not-found view.
  expect(renderer.root.findAllByType(InlineError).length).toBe(0);
  expect(renderedText(renderer).some(t => t.includes("This job isn't available"))).toBe(false);
  expect(renderedText(renderer).some(t => t.includes('Aborted'))).toBe(false);
});

it('aborts the in-flight request on unmount and sets no state after', async () => {
  let capturedSignal!: AbortSignal;
  let release!: (value?: unknown) => void;
  getById.mockImplementationOnce(
    (_id: string, signal: AbortSignal) =>
      new Promise(res => {
        capturedSignal = signal;
        release = () => res(makeDetail());
      }),
  );

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(JobDetailScreen));
    });

    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    // The unmount aborted the in-flight request.
    expect(capturedSignal.aborted).toBe(true);

    // Settling the request after unmount must not surface any React warning
    // (i.e. no setState-after-unmount slipped through).
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await ReactTestRenderer.act(async () => {
        release();
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  } finally {
    release();
  }
});
it('renders the edit/cancel actions only for a scheduled job', async () => {
  getById.mockResolvedValue(makeDetail({ status: 'scheduled', currentStep: null }));
  const renderer = await mountScreen();

  // The scheduled detail renders the actions slot with children; the
  // in_progress default in the next test renders the empty slot instead.
  const actionsSlot = renderer.root.findByProps({ testID: 'job-detail-actions' });
  expect(actionsSlot).toBeDefined();
  expect(renderedText(renderer)).toContain('Edit job');
  expect(renderedText(renderer)).toContain('Cancel job');
});

it('renders no actions for a non-scheduled job', async () => {
  getById.mockResolvedValue(makeDetail()); // in_progress
  const renderer = await mountScreen();

  // Assert on the actions slot, not page text: the EditJobSheet stays mounted
  // while closed (unmounting it would strand TrueSheet's presented sheet), so
  // its hidden "Edit job" title shows up in a whole-page text scan.
  expect(renderer.root.findAllByProps({ testID: 'job-detail-actions' }).length).toBe(0);
  expect(renderedText(renderer)).not.toContain('Cancel job');
});

it('cancel confirms via the ConfirmDialog and PATCHes exactly { status: "cancelled" }', async () => {
  const scheduled = makeDetail({ status: 'scheduled', currentStep: null });
  const cancelled = toApiJob({ ...scheduled, status: 'cancelled' });
  getById.mockResolvedValue(scheduled);
  update.mockResolvedValueOnce(cancelled);
  // The failure alert must never fire on success (the Alert spies error
  // alerts only — the confirm now lives in the shared ConfirmDialog).
  const dialogs = confirmDialogs();
  const renderer = await mountScreen();

  const cancelButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Cancel job');
  expect(cancelButton).toBeDefined();
  await ReactTestRenderer.act(async () => {
    cancelButton!.props.onPress();
  });

  // The ConfirmDialog presents its question; nothing has PATCHed yet.
  const [dialog] = upDialogs(renderer.root);
  expect(dialog.props.title).toBe('Cancel job');
  expect(dialog.props.message).toBe('The employee will no longer see this job.');
  expect(update).not.toHaveBeenCalled();
  expect(getById).toHaveBeenCalledTimes(1);

  // Confirming the dialog sends the cancel — exactly the status field,
  // never mixed with edit fields (a 422 mix).
  await ReactTestRenderer.act(async () => {
    dialog.props.onConfirm();
  });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith('j-1', { status: 'cancelled' });
  // The mutation is applied everywhere: roster counts and a silent refetch.
  // Forced — the mutation must land on Home's tiles immediately, past the
  // focus-refresh throttle.
  expect(loadMyProfileMock).toHaveBeenCalledWith({ force: true });
  expect(getById).toHaveBeenCalledTimes(2);
  expect(dialogs).not.toHaveBeenCalled();
});

it('a thin-embed mutation response must not clobber the detail profiles (Crashlytics 2026-11)', async () => {
  // Epic 23 mutation responses carry the thin `{ id, name }` embeds — the
  // exact wire shape this suite never fed the screen before the crash fix.
  // If applyJobUpdate ever reverts to a bare spread, this test fails where
  // every embed-less fixture stayed green.
  const scheduled = makeDetail({ status: 'scheduled', currentStep: null });
  const thinCancelled = {
    ...toApiJob({ ...scheduled, status: 'cancelled' }),
    technician: { id: 't1', name: 'Anil Kumar' },
    customer: { id: 'c1', name: 'Ravi Kumar' },
  };
  getById.mockResolvedValueOnce(scheduled);
  // The chained silent refetch stays PENDING so the merged (pre-refetch)
  // state is what's asserted — a resolved refetch would mask the merge.
  getById.mockImplementationOnce(() => new Promise(() => {}));
  update.mockResolvedValueOnce(thinCancelled);
  const renderer = await mountScreen();

  const cancelButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Cancel job');
  await ReactTestRenderer.act(async () => {
    cancelButton!.props.onPress();
  });
  const [dialog] = upDialogs(renderer.root);
  await ReactTestRenderer.act(async () => {
    dialog.props.onConfirm();
  });

  expect(update).toHaveBeenCalledTimes(1);
  // Between the merge and the (pending) refetch the FULL person profiles
  // survive: the employee's phone renders from the detail embed (a bare
  // spread renders "+91 undefined") and the skill chips still exist (a bare
  // spread crashed the render outright on `skills.length`).
  const text = renderedText(renderer);
  expect(text).toContain('+91 9000000001');
  expect(text).toContain('AC repair');
});

it('a failed cancel surfaces an alert instead of vanishing', async () => {
  getById.mockResolvedValue(makeDetail({ status: 'scheduled', currentStep: null }));
  update.mockRejectedValueOnce(
    Object.assign(new Error('Offline'), { status: 0, code: 'NETWORK_ERROR', message: 'Offline' }),
  );
  const dialogs = confirmDialogs();
  const renderer = await mountScreen();

  const cancelButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Cancel job');
  await ReactTestRenderer.act(async () => {
    cancelButton!.props.onPress();
  });
  const [dialog] = upDialogs(renderer.root);
  await ReactTestRenderer.act(async () => {
    dialog.props.onConfirm();
    // The press is fire-and-forget — flush the rejected-promise chain too.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  // The failure alert carries title + message only (no retry buttons) — the
  // confirm dialog is already dismissed at this point.
  expect(dialogs).toHaveBeenCalledWith("Couldn't cancel the job", 'Offline');
  expect(upDialogs(renderer.root)).toHaveLength(0);
});

it('a 409 on cancel refetches the detail without an alert', async () => {
  getById.mockResolvedValue(makeDetail({ status: 'scheduled', currentStep: null }));
  update.mockRejectedValueOnce(
    Object.assign(new Error('Started'), { status: 409, code: 'JOB_NOT_MODIFIABLE' }),
  );
  const dialogs = confirmDialogs();
  const renderer = await mountScreen();

  const cancelButton = renderer.root
    .findAllByType(Button)
    .find(b => b.props.children === 'Cancel job');
  await ReactTestRenderer.act(async () => {
    cancelButton!.props.onPress();
  });
  const [dialog] = upDialogs(renderer.root);
  await ReactTestRenderer.act(async () => {
    dialog.props.onConfirm();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  // The job started mid-flow — the refreshed detail explains it; no error UI.
  expect(getById).toHaveBeenCalledTimes(2);
  // No failure alert — the error alert never fires on a 409 refetch.
  expect(dialogs).not.toHaveBeenCalled();
});

// --- The pending decision bar (Epic 22, CAP-5) -------------------------------

/** The bar's two buttons — absent (undefined) when the bar isn't rendered. */
function decisionButtons(root: ReactTestRenderer.ReactTestRenderer['root']) {
  const buttons = root.findAllByType(Button);
  return {
    approve: buttons.find(b => b.props.children === 'Approve'),
    reject: buttons.find(b => b.props.children === 'Reject'),
  };
}

describe('the pending decision bar', () => {
  it('renders only on a pending_approval job, with the creator named', async () => {
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    const renderer = await mountScreen();

    const { approve, reject } = decisionButtons(renderer.root);
    expect(approve).toBeDefined();
    expect(reject).toBeDefined();
    // The note names the employee who created the job (CAP-2's creator is
    // the job's technician) and says what approving does.
    expect(renderedText(renderer).join(' ')).toContain('Anil Kumar created this job.');
  });

  it('falls back to the impersonal note when the creator has no name', async () => {
    // A pending job always HAS a technician (CAP-2 creator-assigned) — the
    // fallback covers a blank name, not a missing technician.
    getById.mockResolvedValue(
      makeDetail({ status: 'pending_approval', currentStep: null, technician: { id: 't1', name: '', countryCode: '+91', phoneNumber: '9000000001', skills: [] } }),
    );
    const renderer = await mountScreen();
    expect(renderedText(renderer).join(' ')).toContain('An employee created this job.');
    // Both buttons exist even without a creator name — the decision never
    // depends on the note.
    expect(decisionButtons(renderer.root).approve).toBeDefined();
  });

  it('never renders on a scheduled job', async () => {
    getById.mockResolvedValue(makeDetail({ status: 'scheduled', currentStep: null }));
    const renderer = await mountScreen();
    expect(decisionButtons(renderer.root).approve).toBeUndefined();
    expect(decisionButtons(renderer.root).reject).toBeUndefined();
  });

  it('Approve POSTs the decision, drops the queue row and reloads', async () => {
    // The refetch returns the DECIDED job — the server's status moved on.
    getById
      .mockResolvedValueOnce(makeDetail({ status: 'pending_approval', currentStep: null }))
      .mockResolvedValue(makeDetail({ status: 'scheduled', currentStep: null }));
    decidePending.mockResolvedValue(
      toApiJob(makeDetail({ status: 'scheduled', currentStep: null })),
    );
    const renderer = await mountScreen();
    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).approve!.props.onPress();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });

    expect(decidePending).toHaveBeenCalledTimes(1);
    expect(decidePending).toHaveBeenCalledWith('j-1', 'approve', undefined);
    expect(mockRemoveApprovalQueueItem).toHaveBeenCalledWith('j-1');
    // The detail reloads so the screen shows the decided state — the bar is
    // gone because the status moved on.
    expect(getById).toHaveBeenCalledTimes(2);
    expect(decisionButtons(renderer.root).approve).toBeUndefined();
  });

  it('Reject opens the reason sheet; confirming carries the reason', async () => {
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    decidePending.mockResolvedValue(
      toApiJob(makeDetail({ status: 'rejected', currentStep: null })),
    );
    const renderer = await mountScreen();

    const sheet = renderer.root.findByType(RejectJobSheet);
    expect(sheet.props.visible).toBe(false);
    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).reject!.props.onPress();
    });
    expect(renderer.root.findByType(RejectJobSheet).props.visible).toBe(true);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(RejectJobSheet).props.onConfirm('Duplicate visit');
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    expect(decidePending).toHaveBeenCalledWith('j-1', 'reject', 'Duplicate visit');
    expect(mockRemoveApprovalQueueItem).toHaveBeenCalledWith('j-1');
    // Success closes the sheet.
    expect(renderer.root.findByType(RejectJobSheet).props.visible).toBe(false);
  });

  it('a 409 JOB_NOT_PENDING reconciles silently: no alert, queue row dropped, detail reloaded', async () => {
    // Another device decided first — nothing the owner did here failed, so
    // the reconciliation (reload + row drop) replaces the error UI.
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    decidePending.mockRejectedValueOnce(
      Object.assign(new Error('Already decided'), { status: 409, code: 'JOB_NOT_PENDING' }),
    );
    const dialogs = confirmDialogs();
    const renderer = await mountScreen();

    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).approve!.props.onPress();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });

    expect(getById).toHaveBeenCalledTimes(2);
    expect(mockRemoveApprovalQueueItem).toHaveBeenCalledWith('j-1');
    expect(dialogs).not.toHaveBeenCalled();
  });

  it('the REJECT path reconciles a 409 the same way: sheet closes, no alert, reload', async () => {
    // The reject 409 was never exercised — the sheet carries typed state
    // (the reason), so "closes silently" had to be pinned, not assumed.
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    decidePending.mockRejectedValueOnce(
      Object.assign(new Error('Already decided'), { status: 409, code: 'JOB_NOT_PENDING' }),
    );
    const dialogs = confirmDialogs();
    const renderer = await mountScreen();

    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).reject!.props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(RejectJobSheet).props.onConfirm('Job duplicates another');
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });

    expect(decidePending).toHaveBeenCalledWith('j-1', 'reject', 'Job duplicates another');
    expect(getById).toHaveBeenCalledTimes(2);
    expect(mockRemoveApprovalQueueItem).toHaveBeenCalledWith('j-1');
    expect(dialogs).not.toHaveBeenCalled();
    expect(renderer.root.findByType(RejectJobSheet).props.visible).toBe(false);
  });

  it('a double-tap on Approve fires exactly one decision POST', async () => {
    // The lock is more than a `disabled` prop: pressing a second time
    // mid-flight must not mint a second POST (review catch — the lock was
    // pinned visually, never exercised).
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    decidePending.mockImplementation(() => new Promise(() => {})); // never settles
    const renderer = await mountScreen();

    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).approve!.props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).approve!.props.onPress();
    });
    expect(decidePending).toHaveBeenCalledTimes(1);
  });

  it('a failed decision re-enables the buttons (the lock is for the flight, not forever)', async () => {
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    decidePending.mockRejectedValueOnce(
      Object.assign(new Error('Offline'), { status: 0, code: 'NETWORK_ERROR', message: 'Offline' }),
    );
    const renderer = await mountScreen();

    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).approve!.props.onPress();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    const { approve, reject } = decisionButtons(renderer.root);
    expect(approve!.props.disabled).toBe(false);
    expect(reject!.props.disabled).toBe(false);
    expect(approve!.props.loading).toBe(false);
  });

  it('a non-409 failure alerts instead of silently losing the decision', async () => {
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    decidePending.mockRejectedValueOnce(
      Object.assign(new Error('Offline'), { status: 0, code: 'NETWORK_ERROR', message: 'Offline' }),
    );
    const dialogs = confirmDialogs();
    const renderer = await mountScreen();

    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).approve!.props.onPress();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });

    expect(dialogs).toHaveBeenCalledWith("Couldn't save the decision", 'Offline');
    // No refetch on a plain failure — the job stays pending for a retry.
    expect(getById).toHaveBeenCalledTimes(1);
    // The queue row is retained too: the job is still pending.
    expect(mockRemoveApprovalQueueItem).not.toHaveBeenCalled();
  });

  it('locks both buttons while a decision is in flight, with per-button loading', async () => {
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    decidePending.mockImplementation(() => new Promise(() => {})); // never settles
    const renderer = await mountScreen();

    await ReactTestRenderer.act(async () => {
      decisionButtons(renderer.root).approve!.props.onPress();
    });
    const { approve, reject } = decisionButtons(renderer.root);
    expect(approve!.props.disabled).toBe(true);
    expect(reject!.props.disabled).toBe(true);
    // The loading spinner rides the pressed button only.
    expect(approve!.props.loading).toBe(true);
    expect(reject!.props.loading).toBe(false);
  });

  it('a viewer (read-only) sees no decision bar even on a pending job', async () => {
    mockCanWrite = false;
    getById.mockResolvedValue(makeDetail({ status: 'pending_approval', currentStep: null }));
    const renderer = await mountScreen();
    expect(decisionButtons(renderer.root).approve).toBeUndefined();
  });
});

beforeEach(() => {
  mockCanWrite = true;
});

describe('a viewer (read-only)', () => {
  it('sees a scheduled job but has no Edit or Cancel, and the edit sheet is never mounted', async () => {
    mockCanWrite = false;
    getById.mockResolvedValue(makeDetail({ status: 'scheduled', currentStep: null }));
    const renderer = await mountScreen();

    expect(renderer.root.findAllByProps({ testID: 'job-detail-actions' })).toHaveLength(0);
    expect(renderer.root.findAllByType(Button).filter(b => ['Edit job', 'Cancel job'].includes(b.props.children))).toHaveLength(0);
    // The whole edit sheet is absent (not just hidden), so its "Edit job" title is gone too.
    expect(renderedText(renderer)).not.toContain('Edit job');
    // The job itself is fully readable, customer included.
    expect(renderedText(renderer)).toContain('Ravi Kumar');
  });

  it('shows the customer phone number (viewers may see phone numbers)', async () => {
    mockCanWrite = false;
    getById.mockResolvedValue(makeDetail({ status: 'scheduled', currentStep: null }));
    const renderer = await mountScreen();

    expect(renderedText(renderer).join(' ')).toMatch(/\+91/);
  });
});
