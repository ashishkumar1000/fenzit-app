/**
 * The roster keeps "invited" apart from "offline" (story 21-4 review fix).
 *
 * The backend sends a membership status per roster row. The app shows only
 * Active or Offline, so before this fix an invited person and a joined but
 * offline person looked the same and both got Resend. `isInvited` carries the
 * difference. `setTechnicianSmsStatus` saves a Resend result so the status line
 * does not reappear after the row remounts.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ProfileTechnician } from '../../services';
import { clearTechnicians, hydrateTechnicianRoster, setTechnicianSmsStatus, useTechnicians } from './useTechnicians';
import type { Technician } from './types';

type Probe = { current: Technician[] };

function renderStore(): Probe {
  const probe: Probe = { current: [] };
  function Harness() {
    probe.current = useTechnicians().technicians;
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Harness />);
  });
  void renderer;
  return probe;
}

function row(id: string, status: string): ProfileTechnician {
  return {
    id,
    employeeCode: 'EMP-010',
    name: `Person ${id}`,
    countryCode: '+91',
    phoneNumber: `9${id.padStart(9, '0')}`,
    status,
    skillIds: [],
    createdAt: '2026-11-11T00:00:00Z',
    avatarUrl: null,
  } as unknown as ProfileTechnician;
}

beforeEach(() => {
  clearTechnicians();
});

describe('roster: invited versus joined', () => {
  it('an invited row is flagged isInvited and shows as offline', () => {
    hydrateTechnicianRoster([row('1', 'invited')]);
    const probe = renderStore();
    expect(probe.current[0]).toMatchObject({ status: 'offline', isInvited: true });
  });

  it('an active row is not invited', () => {
    hydrateTechnicianRoster([row('2', 'active')]);
    const probe = renderStore();
    expect(probe.current[0]).toMatchObject({ status: 'active', isInvited: false });
  });

  it('a joined person who is offline is not invited, so no Resend', () => {
    // A roster status other than `invited` means the person has joined.
    hydrateTechnicianRoster([row('3', 'offline')]);
    const probe = renderStore();
    expect(probe.current[0]).toMatchObject({ status: 'offline', isInvited: false });
  });
});

describe('setTechnicianSmsStatus', () => {
  it('saves the new status on the row', () => {
    hydrateTechnicianRoster([row('4', 'invited')]);
    const before = renderStore();
    act(() => {
      setTechnicianSmsStatus(before.current[0].id, 'sent');
    });
    const after = renderStore();
    expect(after.current[0].smsStatus).toBe('sent');
  });

  it('does nothing for an id that is not on the list', () => {
    hydrateTechnicianRoster([row('5', 'invited')]);
    const before = renderStore();
    act(() => {
      setTechnicianSmsStatus('no-such-id', 'sent');
    });
    const after = renderStore();
    expect(after.current).toEqual(before.current);
  });
});
