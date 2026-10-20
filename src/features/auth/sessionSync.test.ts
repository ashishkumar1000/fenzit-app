/**
 * Tests for syncSessionFromServer (the launch and foreground re-read of the
 * person's company access from `GET /users/me`).
 *
 * The network (`usersApi.getAccess`), the reset registry (`runAllResets`) and the
 * stored session (`getSession` / `updateSessionIfChanged`) are mocked, so
 * these tests pin what the sync decides from each server answer:
 *  - no session → no call at all
 *  - a removed company (tenant null) → role and tenant cleared
 *  - a different company → the old company's data is reset before the new
 *    session is written
 *  - a failed call → the stored session is kept, nothing thrown
 *  - overlapping triggers (launch + foreground) → one request, not two
 */
jest.mock('../../services', () => ({
  usersApi: { getAccess: jest.fn() },
  runAllResets: jest.fn(),
}));

jest.mock('./useAuth', () => ({
  getSession: jest.fn(),
  updateSessionIfChanged: jest.fn(),
}));

import { usersApi, runAllResets } from '../../services';
import { getSession, updateSessionIfChanged } from './useAuth';
import { syncSessionFromServer } from './sessionSync';

const getAccess = usersApi.getAccess as jest.Mock;
const getSessionMock = getSession as jest.Mock;
const updateMock = updateSessionIfChanged as jest.Mock;
const resetMock = runAllResets as jest.Mock;

/** A `GET /users/me` answer, with only the fields the sync reads. */
function meAnswer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    role: 'employee',
    tenant: { id: 'tenant-1' },
    platformAdmin: false,
    ...overrides,
  };
}

/** A stored session as `useAuth` keeps it. */
const SIGNED_IN = {
  role: 'employee',
  tenantId: 'tenant-1',
  platformAdmin: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  getSessionMock.mockReturnValue(SIGNED_IN);
  updateMock.mockReturnValue(true);
});

it('does nothing at all when nobody is signed in', async () => {
  getSessionMock.mockReturnValue(null);
  await syncSessionFromServer();
  expect(getAccess).not.toHaveBeenCalled();
  expect(updateMock).not.toHaveBeenCalled();
  expect(resetMock).not.toHaveBeenCalled();
});

it('hands the store the server answer and resets nothing when the company is unchanged', async () => {
  getAccess.mockResolvedValue(meAnswer());
  await syncSessionFromServer();
  // The store decides whether anything changed; the sync still hands over
  // the server's answer, and no reset fires for an unchanged company.
  expect(updateMock).toHaveBeenCalledWith({
    role: 'employee',
    tenantId: 'tenant-1',
    platformAdmin: false,
  });
  expect(resetMock).not.toHaveBeenCalled();
});

it('clears role and tenant when the company membership is gone', async () => {
  getAccess.mockResolvedValue(meAnswer({ tenant: null, role: 'employee' }));
  await syncSessionFromServer();
  expect(updateMock).toHaveBeenCalledWith({
    role: null,
    tenantId: null,
    platformAdmin: false,
  });
});

it('resets the old company data before writing a session for a different company', async () => {
  getAccess.mockResolvedValue(meAnswer({ tenant: { id: 'tenant-2' }, role: 'viewer' }));
  const order: string[] = [];
  resetMock.mockImplementation(() => order.push('reset'));
  updateMock.mockImplementation(() => order.push('update'));

  await syncSessionFromServer();

  expect(resetMock).toHaveBeenCalledTimes(1);
  expect(order).toEqual(['reset', 'update']);
  expect(updateMock).toHaveBeenCalledWith({
    role: 'viewer',
    tenantId: 'tenant-2',
    platformAdmin: false,
  });
});

it('resets when the company is lost, so the old company data does not stay on screen', async () => {
  getAccess.mockResolvedValue(meAnswer({ tenant: null }));
  await syncSessionFromServer();
  expect(resetMock).toHaveBeenCalledTimes(1);
});

it('treats a role the app does not know as no access, never as a real role', async () => {
  getAccess.mockResolvedValue(meAnswer({ role: 'owner' }));
  await syncSessionFromServer();
  expect(updateMock).toHaveBeenCalledWith({
    role: null,
    tenantId: 'tenant-1',
    platformAdmin: false,
  });
});

it('keeps platform admin false when the server does not send the flag', async () => {
  getAccess.mockResolvedValue(meAnswer({ platformAdmin: undefined }));
  await syncSessionFromServer();
  expect(updateMock.mock.calls[0][0].platformAdmin).toBe(false);
});

it('keeps the stored session and throws nothing when the call fails', async () => {
  getAccess.mockRejectedValue(new TypeError('Network request failed'));
  await expect(syncSessionFromServer()).resolves.toBeUndefined();
  expect(updateMock).not.toHaveBeenCalled();
  expect(resetMock).not.toHaveBeenCalled();
});

it('retries on the next trigger after a failed call', async () => {
  getAccess.mockRejectedValueOnce(new Error('timeout'));
  getAccess.mockResolvedValueOnce(meAnswer({ tenant: null }));

  await syncSessionFromServer();
  await syncSessionFromServer();

  expect(getAccess).toHaveBeenCalledTimes(2);
  expect(updateMock).toHaveBeenCalledWith({
    role: null,
    tenantId: null,
    platformAdmin: false,
  });
});

it('sends one request for overlapping triggers (launch and foreground together)', async () => {
  let finish!: (value: unknown) => void;
  getAccess.mockImplementationOnce(
    () => new Promise(resolve => (finish = resolve)),
  );

  const first = syncSessionFromServer();
  const second = syncSessionFromServer();
  finish(meAnswer());
  await Promise.all([first, second]);

  expect(getAccess).toHaveBeenCalledTimes(1);
});

it('runs again on a later trigger once the earlier one has finished', async () => {
  getAccess.mockResolvedValue(meAnswer());
  await syncSessionFromServer();
  await syncSessionFromServer();
  expect(getAccess).toHaveBeenCalledTimes(2);
});

it('resets company data when the role changes inside the same company', async () => {
  getAccess.mockResolvedValue(meAnswer({ tenant: { id: 'tenant-1' }, role: 'viewer' }));
  await syncSessionFromServer();
  // Same company, lower access: the cached company-wide rows must not stay.
  expect(resetMock).toHaveBeenCalledTimes(1);
  expect(updateMock).toHaveBeenCalledWith({
    role: 'viewer',
    tenantId: 'tenant-1',
    platformAdmin: false,
  });
});

it('drops the answer when the person signed out while the call was in flight', async () => {
  let finish!: (value: unknown) => void;
  getAccess.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
  // Signed in when the sync starts, signed out when the answer arrives.
  getSessionMock.mockReset();
  getSessionMock.mockReturnValueOnce(SIGNED_IN).mockReturnValue(null);

  const pending = syncSessionFromServer();
  finish(meAnswer({ role: 'viewer' }));
  await pending;

  expect(updateMock).not.toHaveBeenCalled();
  expect(resetMock).not.toHaveBeenCalled();
});

it("never writes user A's access onto user B when B signs in during A's call", async () => {
  const userB = { role: 'employee', tenantId: 'tenant-9', platformAdmin: false } as const;
  let finish!: (value: unknown) => void;
  getAccess
    .mockImplementationOnce(() => new Promise(resolve => (finish = resolve)))
    .mockResolvedValue(meAnswer({ tenant: { id: 'tenant-9' }, role: 'employee' }));
  // A is signed in when the sync starts; by the time the answer lands, B is.
  getSessionMock.mockReset();
  getSessionMock.mockReturnValueOnce(SIGNED_IN).mockReturnValue(userB);

  const pending = syncSessionFromServer();
  finish(meAnswer({ role: 'viewer', tenant: { id: 'tenant-1' } }));
  await pending;

  // A's answer (tenant-1, viewer) is never written. B's own answer is.
  expect(updateMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ tenantId: 'tenant-1' }),
  );
  expect(updateMock).toHaveBeenCalledWith(userB);
});

it("still syncs a newly signed-in person while the previous person's call is running", async () => {
  const userB = { role: 'employee', tenantId: 'tenant-9', platformAdmin: false } as const;
  let finishA!: (value: unknown) => void;
  getAccess
    .mockImplementationOnce(() => new Promise(resolve => (finishA = resolve)))
    .mockResolvedValue(meAnswer({ tenant: { id: 'tenant-9' }, role: 'employee' }));
  // The first sync starts for A; B is signed in from then on.
  getSessionMock.mockReset();
  getSessionMock.mockReturnValueOnce(SIGNED_IN).mockReturnValue(userB);

  const firstA = syncSessionFromServer();
  const forB = syncSessionFromServer();
  await forB;
  finishA(meAnswer({ role: 'viewer' }));
  await firstA;

  // B got its own request, and A's late answer was never written.
  expect(getAccess.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(updateMock).toHaveBeenCalledWith(userB);
  expect(updateMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ tenantId: 'tenant-1' }),
  );
});

it('checks again for the current session when the answer was dropped because access changed', async () => {
  const revoked = { role: null, tenantId: null, platformAdmin: false } as const;
  let finishFirst!: (value: unknown) => void;
  getAccess
    .mockImplementationOnce(() => new Promise(resolve => (finishFirst = resolve)))
    .mockResolvedValueOnce(meAnswer({ tenant: { id: 'tenant-1' }, role: 'employee' }));
  // Signed in when the check starts; the 403 check revokes access before the
  // answer lands, so the session object has changed.
  getSessionMock.mockReset();
  getSessionMock.mockReturnValueOnce(SIGNED_IN).mockReturnValue(revoked);

  const pending = syncSessionFromServer();
  finishFirst(meAnswer({ tenant: null }));
  await pending;

  // The first answer was stale and dropped; the re-check restored the company.
  expect(getAccess).toHaveBeenCalledTimes(2);
  expect(updateMock).toHaveBeenCalledTimes(1);
  expect(updateMock).toHaveBeenCalledWith({
    role: 'employee',
    tenantId: 'tenant-1',
    platformAdmin: false,
  });
});
