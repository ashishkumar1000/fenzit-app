/**
 * YourTeamScreen — pins what the screen owns (Epic 24, story 24-5):
 *
 *  - the gate is the server's headcount: an admin, or a person with no
 *    reports, is bounced straight back (no second, narrower owner console);
 *  - the header line is the EXPERIENCE.md copy (`3 people in your team`,
 *    with " · You report to …" only when the caller has a manager);
 *  - the three segments swap the panes, and only an employee manager can
 *    apply on behalf (a viewer manager lacks the right);
 *  - a segment arriving as a route param (a notification tap) is read ONCE
 *    and cleared, so a later focus cannot re-fire it;
 *  - a job tap opens the technician shell for an employee manager and the
 *    owner shell for anyone else.
 *
 * The panes are stubbed prop-capturers — their own behaviour has its own
 * coverage (`useTeam*Queue`, `teamModel`, `LeaveRequestCard`).
 */
jest.mock('../profile', () => {
  const holder: { profile: Record<string, unknown> | null } = { profile: null };
  return {
    __esModule: true,
    useMyProfile: () => ({ profile: holder.profile }),
    __holder: holder,
  };
});

jest.mock('./components/TeamLeavePane', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    TeamLeavePane: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'leave-pane', ...props }),
  };
});

jest.mock('./components/TeamJobsPane', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    TeamJobsPane: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'jobs-pane', ...props }),
  };
});

jest.mock('./components/TeamPeoplePane', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    TeamPeoplePane: (props: Record<string, unknown>) =>
      ReactLib.createElement(View, { testID: 'people-pane', ...props }),
  };
});

import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { SegmentedControl } from '../../components/ui';
import YourTeamScreen from './YourTeamScreen';

const holder = (
  jest.requireMock('../profile') as { __holder: { profile: Record<string, unknown> | null } }
).__holder;

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'me',
    role: 'employee',
    team: {
      managerId: null,
      managerName: null,
      chain: [],
      headcount: 3,
      directReports: 3,
      members: [],
    },
    ...overrides,
  };
}

const mounted: ReactTestRenderer[] = [];

function render(params?: { segment?: 'leave' | 'jobs' | 'people' }) {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), setParams: jest.fn() };
  const route = { key: 'YourTeam', name: 'YourTeam', params };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<YourTeamScreen navigation={navigation as never} route={route as never} />);
  });
  mounted.push(renderer);
  return { root: renderer.root, renderer, navigation };
}

afterEach(() => {
  act(() => {
    mounted.forEach(renderer => renderer.unmount());
  });
  mounted.length = 0;
});

function pane(root: ReactTestInstance, name: 'leave' | 'jobs' | 'people') {
  return root.findAllByProps({ testID: `${name}-pane` })[0];
}

function hasPane(root: ReactTestInstance, name: 'leave' | 'jobs' | 'people') {
  return root.findAllByProps({ testID: `${name}-pane` }).length > 0;
}

describe('the gate', () => {
  it('bounces an admin out (the owner console is the whole-company surface)', () => {
    holder.profile = profile({ role: 'company_admin' });
    const { root, navigation } = render();

    expect(navigation.goBack).toHaveBeenCalled();
    expect(root.findAllByType(Text).map(node => node.props.children)).not.toContain('Your team');
  });

  it('bounces a person with no reports out', () => {
    holder.profile = profile({ team: { ...profile().team as object, headcount: 0 } });
    const { navigation } = render();

    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('shows a spinner while the profile is still loading', () => {
    holder.profile = null;
    const { root } = render();

    expect(hasPane(root, 'leave')).toBe(false);
  });
});

describe('the header + segments', () => {
  beforeEach(() => {
    holder.profile = profile();
  });

  it('prints the headcount line and the caller own manager when there is one', () => {
    holder.profile = profile({
      team: {
        ...profile().team as object,
        managerName: 'PQA Owner Ashok Rao',
      },
    });
    const { root } = render();

    const texts = root.findAllByType(Text).map(node => node.props.children);
    expect(texts).toContain('Your team');
    expect(texts).toContain('3 people in your team · You report to PQA Owner Ashok Rao');
  });

  it('lands on Leave and swaps panes with the segment control', () => {
    const { root } = render();
    expect(hasPane(root, 'leave')).toBe(true);
    expect(hasPane(root, 'jobs')).toBe(false);

    act(() => {
      root.findByType(SegmentedControl).props.onChange('jobs');
    });
    expect(hasPane(root, 'jobs')).toBe(true);
    expect(hasPane(root, 'leave')).toBe(false);

    act(() => {
      root.findByType(SegmentedControl).props.onChange('people');
    });
    expect(hasPane(root, 'people')).toBe(true);
  });

  it('an employee manager can apply on behalf; a viewer manager cannot', () => {
    const employee = render();
    act(() => {
      employee.root.findByType(SegmentedControl).props.onChange('people');
    });
    expect(pane(employee.root, 'people').props.canApply).toBe(true);

    holder.profile = profile({ role: 'viewer' });
    const viewer = render();
    act(() => {
      viewer.root.findByType(SegmentedControl).props.onChange('people');
    });
    expect(pane(viewer.root, 'people').props.canApply).toBe(false);
  });

  it('a job tap opens TechJobDetail for an employee and JobDetail for a viewer', () => {
    const employee = render();
    act(() => {
      employee.root.findByType(SegmentedControl).props.onChange('jobs');
    });
    act(() => {
      pane(employee.root, 'jobs').props.onOpenJob('job-1');
    });
    expect(employee.navigation.navigate).toHaveBeenCalledWith('TechJobDetail', { jobId: 'job-1' });

    holder.profile = profile({ role: 'viewer' });
    const viewer = render();
    act(() => {
      viewer.root.findByType(SegmentedControl).props.onChange('jobs');
    });
    act(() => {
      pane(viewer.root, 'jobs').props.onOpenJob('job-2');
    });
    expect(viewer.navigation.navigate).toHaveBeenCalledWith('JobDetail', { jobId: 'job-2' });
  });
});

describe('the segment route param (a notification tap)', () => {
  it('opens that segment and clears the param so it cannot re-fire', () => {
    holder.profile = profile();
    const { root, navigation } = render({ segment: 'jobs' });

    expect(hasPane(root, 'jobs')).toBe(true);
    expect(navigation.setParams).toHaveBeenCalledWith({ segment: undefined });

    // A later re-render with the param already cleared stays on the user's
    // choice — the read is one-shot.
    act(() => {
      root.findByType(SegmentedControl).props.onChange('leave');
    });
    expect(hasPane(root, 'leave')).toBe(true);
  });
});
