/**
 * FirstRunFlow — who sees the owner tour (login redesign). The requirement,
 * verbatim from the product owner: "How your job runs" is EXCLUSIVE to
 * business owners — an employee never sees that page and lands straight on
 * the permissions primer; both paths still end in the reward and call
 * `onDone`. The step screens are mocked and driven through their props
 * (AuthFlow test pattern); fake timers drive the reward's auto-advance.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('./HowItWorksScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('./PermissionsPrimerScreen', () => ({ __esModule: true, default: () => null }));

import FirstRunFlow from './FirstRunFlow';
import HowItWorksScreen from './HowItWorksScreen';
import PermissionsPrimerScreen from './PermissionsPrimerScreen';

function render(role: Parameters<typeof FirstRunFlow>[0]['role'], notice?: string | null) {
  const onDone = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(
      <FirstRunFlow role={role} notice={notice} onDone={onDone} />,
    );
  });
  return { r, onDone };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('an employee', () => {
  it('NEVER sees the owner tour — the permissions primer is the first page', () => {
    const { r } = render('employee');

    expect(r.root.findAllByType(HowItWorksScreen)).toHaveLength(0);
    expect(r.root.findAllByType(PermissionsPrimerScreen)).toHaveLength(1);
  });

  it('primer → reward → done', () => {
    const { r, onDone } = render('employee');

    act(() => {
      r.root.findByType(PermissionsPrimerScreen).props.onContinue();
    });
    // The reward shows for its full window before onDone fires.
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a viewer is not an owner either — they skip the tour too (review fix)', () => {
    const { r } = render('viewer');

    expect(r.root.findAllByType(HowItWorksScreen)).toHaveLength(0);
    expect(r.root.findAllByType(PermissionsPrimerScreen)).toHaveLength(1);
  });

  it('the mismatch correction rides to the primer (review fix)', () => {
    const notice = 'This number is registered as a field employee.';
    const { r } = render('employee', notice);

    expect(r.root.findByType(PermissionsPrimerScreen).props.notice).toBe(notice);
  });
});

describe('a business owner', () => {
  it('starts at "How a job runs" — the tour is theirs', () => {
    const { r } = render('company_admin');

    expect(r.root.findAllByType(HowItWorksScreen)).toHaveLength(1);
    expect(r.root.findAllByType(PermissionsPrimerScreen)).toHaveLength(0);
  });

  it('tour → primer → reward → done', () => {
    const { r, onDone } = render('company_admin');

    act(() => {
      r.root.findByType(HowItWorksScreen).props.onContinue();
    });
    act(() => {
      r.root.findByType(PermissionsPrimerScreen).props.onContinue();
    });
    act(() => {
      jest.advanceTimersByTime(1600);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
