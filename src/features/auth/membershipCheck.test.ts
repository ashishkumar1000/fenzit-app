/**
 * Tests for checkMembershipAfterForbidden: a 403 re-reads the profile, and
 * only a removed membership clears access. The stored session and the HTTP
 * client are mocked; these tests pin who gets cleared, not how.
 */
jest.mock('../../services/api/apiClient', () => ({
  apiClient: { get: jest.fn() },
}));

jest.mock('./useAuth', () => ({
  getSession: jest.fn(),
}));

import { apiClient } from '../../services/api/apiClient';
import { getSession } from './useAuth';
import { checkMembershipAfterForbidden } from './membershipCheck';

const get = apiClient.get as jest.Mock;
const getSessionMock = getSession as jest.Mock;

const PERSON_A = { role: 'employee', tenantId: 'tenant-1', platformAdmin: false } as const;
const PERSON_B = { role: 'viewer', tenantId: 'tenant-1', platformAdmin: false } as const;

beforeEach(() => {
  jest.clearAllMocks();
  getSessionMock.mockReset();
  getSessionMock.mockReturnValue(PERSON_A);
});

it('clears access when the profile says the company membership is gone', async () => {
  get.mockResolvedValue({ data: { tenant: null } });
  const onRemoved = jest.fn();
  await checkMembershipAfterForbidden(onRemoved);
  expect(onRemoved).toHaveBeenCalledTimes(1);
});

it('leaves access alone when the person is still in the company (an ordinary permission refusal)', async () => {
  get.mockResolvedValue({ data: { tenant: { id: 'tenant-1' } } });
  const onRemoved = jest.fn();
  await checkMembershipAfterForbidden(onRemoved);
  expect(onRemoved).not.toHaveBeenCalled();
});

it('keeps access and throws nothing when the profile call fails', async () => {
  get.mockRejectedValue(new Error('offline'));
  const onRemoved = jest.fn();
  await expect(checkMembershipAfterForbidden(onRemoved)).resolves.toBeUndefined();
  expect(onRemoved).not.toHaveBeenCalled();
});

it('does nothing when nobody is signed in', async () => {
  getSessionMock.mockReturnValue(null);
  const onRemoved = jest.fn();
  await checkMembershipAfterForbidden(onRemoved);
  expect(get).not.toHaveBeenCalled();
  expect(onRemoved).not.toHaveBeenCalled();
});

it('does not clear person B when person A removal answer arrives after B signed in', async () => {
  let finish!: (value: unknown) => void;
  get.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
  // A is signed in when the 403 arrives; B is signed in when the answer lands.
  getSessionMock.mockReset();
  getSessionMock.mockReturnValueOnce(PERSON_A).mockReturnValue(PERSON_B);

  const onRemoved = jest.fn();
  const pending = checkMembershipAfterForbidden(onRemoved);
  finish({ data: { tenant: null } });
  await pending;

  expect(onRemoved).not.toHaveBeenCalled();
});

it('checks again for person B when B gets a 403 while A check is still running', async () => {
  let finishA!: (value: unknown) => void;
  get
    .mockImplementationOnce(() => new Promise(resolve => (finishA = resolve)))
    .mockResolvedValueOnce({ data: { tenant: null } });
  getSessionMock.mockReset();
  getSessionMock.mockReturnValueOnce(PERSON_A).mockReturnValue(PERSON_B);

  const onRemoved = jest.fn();
  const first = checkMembershipAfterForbidden(onRemoved);
  // B's 403 must not be swallowed by A's check still running.
  await checkMembershipAfterForbidden(onRemoved);
  finishA({ data: { tenant: { id: 'tenant-1' } } });
  await first;

  expect(get).toHaveBeenCalledTimes(2);
  expect(onRemoved).toHaveBeenCalledTimes(1);
});

it('does not treat Fenzit staff with no company as removed', async () => {
  get.mockResolvedValue({ data: { tenant: null, platformAdmin: true } });
  const onRemoved = jest.fn();
  await checkMembershipAfterForbidden(onRemoved);
  expect(onRemoved).not.toHaveBeenCalled();
});
