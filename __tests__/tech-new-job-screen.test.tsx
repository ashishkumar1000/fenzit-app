/**
 * TechNewJobScreen — the employee's create flow (Epic 22 story 22-7).
 *
 * The suite pins the screen's riskiest machinery:
 *  - the three one-shot param channels (SelectSkills / SelectCustomers /
 *    AddCustomer draft) apply once and clear — a consumed param never
 *    re-applies on a later visit;
 *  - a returned draft IS the selection: a saved pick is dropped with it
 *    (the two customer arms are mutually exclusive);
 *  - the idempotency key contract: minted at submit, KEPT across a failed
 *    submit (a lost response retries with the SAME key so the server
 *    replays, never double-creates), VOIDED by any form edit, cleared on
 *    success;
 *  - the draft's `newCustomer` wire payload (name/phone mandatory, the
 *    snapshot's coordinates as a unit, empty fields omitted, placeId
 *    never sent);
 *  - the self-assignment rule (CAP-2: technicianId = the profile's own id)
 *    and the submit gates (past slot blocked, missing skill hinted).
 *
 * Child pickers and the date fields are stubs — their forms have their own
 * suites; the stores are mocked at their boundaries.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
}));

jest.mock('../src/services', () => ({
  jobService: { create: jest.fn() },
}));

jest.mock('../src/services/telemetry', () => ({
  logEvent: jest.fn(),
}));

jest.mock('../src/utils/idempotency', () => ({
  generateIdempotencyKey: jest.fn(),
}));

jest.mock('../src/features/profile', () => ({
  loadMyProfile: jest.fn(),
  useMyProfile: jest.fn(),
}));

jest.mock('../src/features/skills', () => ({
  loadSkills: jest.fn(),
  useSkills: jest.fn(),
}));

jest.mock('../src/features/customers', () => ({
  loadCustomers: jest.fn(),
  useCustomers: jest.fn(),
}));

jest.mock('../src/features/jobs/useJobs', () => ({
  upsertJob: jest.fn(),
}));

jest.mock('../src/features/technicianApp/useTechnicianJobs', () => ({
  loadToday: jest.fn(),
}));

jest.mock('../src/features/newJob/components/DateTimeFields', () => ({
  DateTimeFields: jest.fn(() => null),
}));

jest.mock('../src/features/newJob/components/SkillPicker', () => ({
  SkillPicker: jest.fn(() => null),
}));

jest.mock('../src/features/newJob/components/CustomerPicker', () => ({
  CustomerPicker: jest.fn(() => null),
}));

import TechNewJobScreen from '../src/features/technicianApp/TechNewJobScreen';
import { jobService } from '../src/services';
import { generateIdempotencyKey } from '../src/utils/idempotency';
import { useMyProfile } from '../src/features/profile';
import { useSkills } from '../src/features/skills';
import { useCustomers } from '../src/features/customers';
import { upsertJob } from '../src/features/jobs/useJobs';
import { loadToday } from '../src/features/technicianApp/useTechnicianJobs';
import type { ApiJob, MyProfile, Skill, ApiCustomer, NewCustomerPayload } from '../src/services';

const create = jobService.create as jest.Mock;
const useMyProfileMock = useMyProfile as jest.Mock;
const useSkillsMock = useSkills as jest.Mock;
const useCustomersMock = useCustomers as jest.Mock;
const idempotencyKey = generateIdempotencyKey as jest.Mock;

/** A submit clock that is comfortably in the future: 2026-11-13 noon UTC. */
jest.useFakeTimers({ now: Date.parse('2026-11-13T12:00:00.000Z') });

const PROFILE: MyProfile = {
  id: 'emp-1',
  name: 'Amit Sharma',
  countryCode: '+91',
  phoneNumber: '9123456789',
  status: 'active',
  role: 'employee',
  canCreateJobs: true,
  jobApprovalRequired: true,
  tenant: {
    id: 't-1',
    companyName: 'Fenzit Services',
    gstin: null,
    address: null,
    stateCode: 'TN',
    upiVpa: null,
  },
  technicians: [],
  technicianCount: 1,
  customers: { data: [], nextCursor: null, hasMore: false },
  jobs: { data: [], nextCursor: null, hasMore: false },
  jobCounts: { today: 0, upcoming: 0, overdue: 0, completed: 0, cancelled: 0 },
} as unknown as MyProfile;

const SKILL = { id: 'sk-1', name: 'Plumbing', description: 'Plumbing work', icon: 'wrench' } as unknown as Skill;
const CUSTOMER: ApiCustomer = {
  id: 'c-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000002',
  address: '12 Anna Nagar',
  city: 'Chennai',
  jobCount: 0,
  lastJobDate: null,
};

const makeJob = (overrides: Partial<ApiJob> = {}): ApiJob => ({
  id: 'j-new',
  jobNumber: 'JB-2026-0101',
  tenantId: 't-1',
  customerId: 'c-1',
  technicianId: 'emp-1',
  serviceLocation: '12 Anna Nagar, Chennai',
  skill: { id: 'sk-1', name: 'Plumbing' },
  scheduledStart: '2026-11-14T10:00:00.000Z',
  scheduledEnd: null,
  status: 'pending_approval',
  currentStep: null,
  priority: 'normal',
  requireCompletionPhoto: false,
  requireCompletionSignature: false,
  description: null,
  notesForTechnician: null,
  createdAt: '2026-11-13T12:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-11-13T12:00:00.000Z',
  ...overrides,
});

type RouteParams = {
  selectedSkillId?: string | null;
  selectedCustomerId?: string | null;
  newCustomerDraft?: unknown;
};

let routeParams: RouteParams = {};

/** Stores return settled data; route params are set per test. */
function stores() {
  useMyProfileMock.mockReturnValue({ profile: PROFILE, isLoading: false, error: null, refresh: jest.fn() });
  useSkillsMock.mockReturnValue({ skills: [SKILL], isLoading: false, error: null, refresh: jest.fn() });
  useCustomersMock.mockReturnValue({
    customers: [CUSTOMER],
    isLoading: false,
    error: null,
    hasLoaded: true,
    refresh: jest.fn(),
  });
}

/** Swappable navigation stubs — tests that assert goBack replace it. */
const navStubs = { goBack: jest.fn() };

async function mount(params: RouteParams = {}): Promise<ReactTestRenderer.ReactTestRenderer> {
  routeParams = params;
  stores();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    // Navigation props are static stubs; the param channels are read from
    // route.params (consumed via navigation.setParams).
    renderer = ReactTestRenderer.create(
      React.createElement(TechNewJobScreen, {
        navigation: { navigate: mockNavigate, goBack: navStubs.goBack, setParams: mockSetParams },
        route: { key: 'TechNewJob', name: 'TechNewJob', params: routeParams },
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

/** The picker stubs — identified by their title prop ("Skill" / "Customer"). */
function pickerOf(
  renderer: ReactTestRenderer.ReactTestRenderer,
  title: string,
): ReactTestRenderer.ReactTestInstance {
  const match = renderer.root
    .findAll(n => n.props?.title === title)
    .find(n => typeof n.props.onChange === 'function');
  if (!match) throw new Error(`picker not found: ${title}`);
  return match;
}

/** The submit Button's Pressable — found by its 'Create job' label text. */
function submitPressable(
  renderer: ReactTestRenderer.ReactTestRenderer,
): ReactTestRenderer.ReactTestInstance | undefined {
  return renderer.root
    .findAll(t => t.props.children === 'Create job')
    .map(t => {
      let p = t.parent as ReactTestRenderer.ReactTestInstance | null;
      while (p && p.props?.onPress === undefined) p = p.parent;
      return p;
    })
    .filter(Boolean)[0] as ReactTestRenderer.ReactTestInstance | undefined;
}

/** Progressive disclosure: the Customer section only mounts after a skill
 *  pick — so the two picks run in separate acts (a real user taps, the
 *  screen re-renders, then they tap again). */
async function pickSkillAndCustomer(
  renderer: ReactTestRenderer.ReactTestRenderer,
): Promise<void> {
  await pickSkill(renderer);
  await ReactTestRenderer.act(async () => {
    (pickerOf(renderer, 'Customer').props as { onChange: (v: string) => void }).onChange('c-1');
  });
}

async function pickSkill(renderer: ReactTestRenderer.ReactTestRenderer): Promise<void> {
  await ReactTestRenderer.act(async () => {
    (pickerOf(renderer, 'Skill').props as { onChange: (v: string) => void }).onChange('sk-1');
  });
}

/** Presses Create job without touching the form (the true retry path). */
async function pressSubmit(
  renderer: ReactTestRenderer.ReactTestRenderer,
): Promise<void> {
  const submit = submitPressable(renderer);
  if (!submit) throw new Error('Create job button not rendered');
  await ReactTestRenderer.act(async () => {
    submit.props.onPress();
  });
}

/** Sets the form to a submittable state by picking skill + customer. */
async function fillAndPress(
  renderer: ReactTestRenderer.ReactTestRenderer,
): Promise<void> {
  await pickSkillAndCustomer(renderer);
  const submit = submitPressable(renderer);
  if (!submit) throw new Error('Create job button not rendered');
  await ReactTestRenderer.act(async () => {
    submit.props.onPress();
  });
}

afterEach(() => {
  ReactTestRenderer.act(() => {
    // reset, not clear: the queued mockReturnValueOnce values must not leak
    // into the next test's mint order.
    jest.resetAllMocks();
  });
  routeParams = {};
  navStubs.goBack = jest.fn();
  // Re-pin the clock: a test that advanced it (the past-slot gate) must not
  // poison later tests in the file, and a failing test must not skip the
  // restore statement that used to sit at the end of that test's body.
  jest.setSystemTime(Date.parse('2026-11-13T12:00:00.000Z'));
});

describe('the param channels', () => {
  it('a returned skill is applied once and the param cleared', async () => {
    const renderer = await mount({ selectedSkillId: 'sk-1' });
    expect(mockSetParams).toHaveBeenCalledWith({ selectedSkillId: undefined });
    expect(pickerOf(renderer, 'Skill').props.value).toBe('sk-1');
  });

  it('a returned customer draft IS the selection and drops any saved pick', async () => {
    const draft = {
      name: 'New Person',
      phone: '9876543210',
      street: '2 Kovil Street',
      city: 'Chennai',
      area: '600001',
      addressDetails: '',
      snapshot: { latitude: 13.08, longitude: 80.27, formattedAddress: '2 Kovil Street, Chennai 600001', pincode: '600001', placeId: 'p-1' },
      previewLine: '2 Kovil Street, Chennai 600001',
    };
    const renderer = await mount({ selectedCustomerId: 'c-1', newCustomerDraft: draft });
    expect(mockSetParams).toHaveBeenCalledWith({ newCustomerDraft: undefined });
    // Progressive disclosure: pick a skill to reveal the Customer section.
    await ReactTestRenderer.act(async () => {
      (pickerOf(renderer, 'Skill').props as { onChange: (v: string) => void }).onChange('sk-1');
    });
    // The draft card IS the selection — the saved-customer picker's inline
    // add row is gone with it (the two arms can never both be live; the
    // section's own "Customer" heading legitimately stays).
    expect(allText(renderer)).toContain('New Person');
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Add new customer' }),
    ).toHaveLength(0);
  });
});

describe('the idempotency key', () => {
  it('a failed submit keeps the key — the retry reuses it (server replays, no second job)', async () => {
    idempotencyKey.mockReturnValueOnce('key-1').mockReturnValueOnce('key-2');
    create.mockRejectedValueOnce(Object.assign(new Error('Lost'), { message: 'Lost' }));
    const renderer = await mount();
    await fillAndPress(renderer);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toBe('key-1');

    // Retry (no form edit — just press Create again) — SAME key.
    create.mockResolvedValueOnce(makeJob());
    await pressSubmit(renderer);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][1]).toBe('key-1');
  });

  it('a form edit voids the key — the next submit mints a new one', async () => {
    idempotencyKey
      .mockReturnValueOnce('key-1')
      .mockReturnValueOnce('key-2');
    create.mockRejectedValueOnce(Object.assign(new Error('Lost'), { message: 'Lost' }));
    const renderer = await mount();
    await fillAndPress(renderer);

    // An edit (any picker change) clears the stored key.
    await ReactTestRenderer.act(async () => {
      (pickerOf(renderer, 'Skill').props as { onChange: (v: string) => void }).onChange('sk-1');
    });

    create.mockResolvedValueOnce(makeJob());
    await fillAndPress(renderer);
    expect(create.mock.calls[1][1]).toBe('key-2');
  });

  it('a successful submit clears the key — a later submit is a new action', async () => {
    idempotencyKey
      .mockReturnValueOnce('key-1')
      .mockReturnValueOnce('key-2');
    create.mockResolvedValueOnce(makeJob());
    const renderer = await mount();
    await fillAndPress(renderer);
    expect(create).toHaveBeenCalledTimes(1);
    await fillAndPress(renderer);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][1]).toBe('key-2');
  });
});

describe('the draft customer payload', () => {
  it('maps the draft to the newCustomer payload: coordinates as a unit, empties omitted', async () => {
    idempotencyKey.mockReturnValue('key-1');
    create.mockResolvedValue(makeJob());
    const draft = {
      name: 'New Person',
      phone: '9876543210',
      street: '2 Kovil Street',
      city: 'Chennai',
      area: '',
      addressDetails: '',
      snapshot: { latitude: 13.08, longitude: 80.27, formattedAddress: '2 Kovil Street, Chennai 600001', pincode: null, placeId: 'p-1' },
      previewLine: '2 Kovil Street, Chennai 600001',
    };
    const r = await mount({ newCustomerDraft: draft });

    await ReactTestRenderer.act(async () => {
      (pickerOf(r!, 'Skill').props as { onChange: (v: string) => void }).onChange('sk-1');
    });
    const submit = submitPressable(r!);
    await ReactTestRenderer.act(async () => {
      submit!.props.onPress();
    });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0][0] as Record<string, unknown>;
    const nc = payload.newCustomer as NewCustomerPayload;
    expect(nc.name).toBe('New Person');
    expect(nc.countryCode).toBe('+91');
    expect(nc.phoneNumber).toBe('9876543210');
    expect(nc.address).toBe('2 Kovil Street');
    expect(nc.city).toBe('Chennai');
    expect(nc.latitude).toBe(13.08);
    expect(nc.longitude).toBe(80.27);
    expect(nc.formattedAddress).toBe('2 Kovil Street, Chennai 600001');
    // Empty fields are omitted, never empty strings — and placeId (draft
    // bookkeeping) is not part of the job payload.
    expect('pincode' in nc).toBe(false);
    expect('placeId' in nc).toBe(false);
    expect('addressDetails' in nc).toBe(false);
  });

  it('the employee self-assigns (CAP-2) — technicianId is the profile id', async () => {
    idempotencyKey.mockReturnValue('key-1');
    create.mockResolvedValue(makeJob());
    const r = await mount();
    await pickSkillAndCustomer(r!);
    const submit = submitPressable(r!);
    await ReactTestRenderer.act(async () => {
      submit!.props.onPress();
    });
    const payload = create.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.technicianId).toBe('emp-1');
    // The XOR contract: a saved pick sends customerId, never newCustomer.
    expect(payload.customerId).toBe('c-1');
    expect('newCustomer' in payload).toBe(false);
  });

  it('a success upserts the row, force-refreshes the Today store, says so, then closes', async () => {
    idempotencyKey.mockReturnValue('key-1');
    create.mockResolvedValue(makeJob());
    const mockGoBack = jest.fn();
    navStubs.goBack = mockGoBack;
    const r = await mount();
    await pickSkillAndCustomer(r!);
    const submit = submitPressable(r!);
    await ReactTestRenderer.act(async () => {
      submit!.props.onPress();
    });
    expect(upsertJob).toHaveBeenCalledWith(makeJob());
    expect(loadToday).toHaveBeenCalledWith({ force: true });
    // The job vanishes from every day list (CAP-4) — the screen says the
    // outcome before it closes (a silent close left no confirmation for
    // the approval path at all).
    expect(allText(r!)).toContain('Job created');
    expect(allText(r!)).toContain('waiting for approval');
    // Auto-close: the note is brief, then the screen goes back.
    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(1600);
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled(); // goBack closes, never navigate
  });
});

describe('the remaining param channel and the failure path', () => {
  it('a returned customer id is applied once, cleared, and rides the submit payload', async () => {
    // The suite only ever exercised the DRAFT channel; the saved-customer
    // channel had no test at all. (The selected customer's name renders
    // inside the picker stub, so the payload is the honest assertion.)
    idempotencyKey.mockReturnValue('key-1');
    create.mockResolvedValue(makeJob());
    const renderer = await mount({ selectedCustomerId: 'c-1' });
    expect(mockSetParams).toHaveBeenCalledWith({ selectedCustomerId: undefined });
    await pickSkill(renderer);
    const submit = submitPressable(renderer);
    await ReactTestRenderer.act(async () => {
      submit!.props.onPress();
    });
    const payload = create.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.customerId).toBe('c-1');
  });

  it('a failed submit shows the error inline and unlocks the button', async () => {
    idempotencyKey.mockReturnValue('key-1');
    create.mockRejectedValueOnce(new Error('Network request failed'));
    const r = await mount();
    await pickSkillAndCustomer(r!);
    const submit = submitPressable(r!);
    await ReactTestRenderer.act(async () => {
      submit!.props.onPress();
    });
    expect(allText(r!)).toContain('Network request failed');
    expect(submitPressable(r!)!.props.disabled).toBe(false);
    // No auto-close happened — the screen is still up with the error.
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('the submit gates', () => {
  it('a past slot is blocked and the hint says so', async () => {
    idempotencyKey.mockReturnValue('key-1');
    const r = await mount();
    // Fill skill + customer first — the hint walks that order, and only a
    // fully-elsewhere-ready form surfaces the time hint.
    await pickSkillAndCustomer(r!);
    // The slot was chosen at mount (an hour ahead of the pinned clock);
    // advancing the clock makes it past, but the hint only re-computes on a
    // render — drive a REAL state change (the Notes field) so the tree
    // re-renders, the way any user edit would.
    jest.setSystemTime(Date.parse('2026-11-14T12:00:00.000Z'));
    await ReactTestRenderer.act(async () => {
      const notes = r!.root.findByType(TextInput);
      notes.props.onChangeText('bring a ladder');
    });
    expect(allText(r!)).toContain('Pick a time that is still to come');
    const submit = submitPressable(r!);
    expect(submit!.props.disabled).toBe(true);
    // (Clock restore moved to afterEach — a throw above it used to skip it.)
  });
});
