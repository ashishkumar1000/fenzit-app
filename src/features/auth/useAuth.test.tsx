/**
 * Tests for the useAuth session-expiry lifecycle (story 5.3): `expireSession`
 * clears the session AND raises the in-memory expiry flag the login banner
 * reads; `complete` (a fresh login) clears the flag; `clearSessionExpired`
 * is the dismiss path and is a no-op when nothing expired. The flag is
 * in-memory only — nothing here touches persistence beyond the session key
 * itself.
 *
 * `storage` runs on the global manual MMKV mock (`__mocks__/
 * react-native-mmkv.ts`, Map-backed) — no jest.mock needed here. That mock
 * persists across tests in this file, so `beforeEach` resets the store to a
 * clean slate (no session, no expiry flag) to keep the tests order-free.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  useAuth,
  useSessionExpired,
  expireSession,
  clearSessionExpired,
  parseSession,
  markReturningUser,
  isReturningUser,
} from './useAuth';
import { storage } from '../../services/storage';

// One probe reading both halves of the store — the same shapes App.tsx's
// gate and PhoneScreen's banner consume.
let probe: ReturnType<typeof useAuth> & { expired: boolean };
function Probe() {
  const auth = useAuth();
  probe = { ...auth, expired: useSessionExpired() };
  return null;
}

beforeEach(() => {
  // Reset the module-level store, whatever the previous test left behind:
  // `expireSession` nulls the session (and drops the persisted key), and
  // `clearSessionExpired` lowers the flag — together, a clean first render.
  act(() => {
    expireSession();
    clearSessionExpired();
  });
  act(() => {
    create(<Probe />);
  });
});

describe('session expiry (story 5.3)', () => {
  it('expireSession clears the gate and raises the expiry flag', () => {
    act(() => {
      probe.complete({ role: 'company_admin', tenantId: 't1', platformAdmin: false });
    });
    expect(probe.status).toBe('done');
    expect(probe.expired).toBe(false);

    act(() => {
      expireSession();
    });

    expect(probe.status).toBe('pending');
    expect(probe.session).toBeNull();
    expect(probe.expired).toBe(true);
  });

  it('a fresh login clears the expiry flag', () => {
    act(() => {
      expireSession();
    });
    expect(probe.expired).toBe(true);

    act(() => {
      probe.complete({ role: 'employee', tenantId: 't2', platformAdmin: false });
    });

    expect(probe.status).toBe('done');
    expect(probe.expired).toBe(false);
  });

  it('clearSessionExpired dismisses the flag without signing anyone in', () => {
    act(() => {
      expireSession();
    });
    expect(probe.expired).toBe(true);

    act(() => {
      clearSessionExpired();
    });

    expect(probe.expired).toBe(false);
    expect(probe.status).toBe('pending'); // still at the login gate
  });

  it('clearSessionExpired is a no-op when nothing expired', () => {
    expect(probe.expired).toBe(false);

    act(() => {
      clearSessionExpired();
    });

    expect(probe.expired).toBe(false);
  });

  it('expireSession is idempotent — a second call does not lose the flag', () => {
    act(() => {
      expireSession();
      expireSession();
    });
    expect(probe.expired).toBe(true);
    expect(probe.status).toBe('pending');
  });
});

describe('the returning-device flag (login greeting)', () => {
  // The flag is persisted and the mock store outlives a single test — drop
  // it first so the tests stay order-free whatever a previous test did.
  beforeEach(() => {
    storage.remove('fenzit.auth.returning');
  });

  it('a fresh device is not returning', () => {
    expect(isReturningUser()).toBe(false);
  });

  it('a completed login marks the device returning', () => {
    act(() => {
      probe.complete({ role: 'company_admin', tenantId: 't1', platformAdmin: false });
    });

    expect(isReturningUser()).toBe(true);
  });

  it('the flag survives a session expiry — a logged-out person is still returning', () => {
    markReturningUser();

    act(() => {
      expireSession();
    });

    expect(probe.status).toBe('pending'); // logged out
    expect(isReturningUser()).toBe(true); // …but the device remembers them
  });
});

describe('stored session validation (roles rename)', () => {
  it.each([
    ['company admin', { role: 'company_admin', tenantId: 't1', platformAdmin: false }],
    ['employee', { role: 'employee', tenantId: 't1', platformAdmin: false }],
    ['viewer', { role: 'viewer', tenantId: 't1', platformAdmin: false }],
    ['a person with no company', { role: null, tenantId: null, platformAdmin: false }],
    ['Fenzit staff', { role: null, tenantId: null, platformAdmin: true }],
  ])('keeps a valid %s session as it is', (_name, stored) => {
    expect(parseSession(stored)).toEqual(stored);
  });

  it.each([
    ['a session saved by an older build (owner)', { role: 'owner', tenantId: 't1' }],
    ['a session saved by an older build (technician)', { role: 'technician', tenantId: 't1' }],
    ['a stale shape without the staff flag', { role: 'company_admin', tenantId: 't1' }],
    ['an unknown role', { role: 'superuser', tenantId: 't1', platformAdmin: false }],
    ['a numeric tenant', { role: 'employee', tenantId: 5, platformAdmin: false }],
    ['a string staff flag', { role: 'employee', tenantId: 't1', platformAdmin: 'true' }],
    ['null', null],
    ['a bare string', 'company_admin'],
    ['an array', []],
  ])('drops %s so the person simply logs in again', (_name, stored) => {
    expect(parseSession(stored)).toBeNull();
  });
});
