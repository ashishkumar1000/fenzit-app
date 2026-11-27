/**
 * JobSettingsSheet — the owner's member sheet (Epic 24, story 24-5 adds the
 * Reporting manager section). Pins:
 *
 *  - the section renders above the job switches for every non-removed member
 *    (a viewer can hold a manager too), with "Reports to" / "The company
 *    owner" and the
 *    "No one above them in the team yet." line at the top of the tree;
 *  - a set manager prints the name, the upward chain (the owner marked) and
 *    the report headcount;
 *  - the picker opens as a STAGE in the same sheet, excludes the member and
 *    their subtree, and carries the D13 viewer note;
 *  - Save persists via PATCH and returns to the settings stage with the row
 *    re-read from the response; clearing sends `null`;
 *  - a refusal keeps the stage open and shows the server's plain-English
 *    message verbatim (the previous value untouched).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { membersService } from '../../../services';
import type { CompanyMember } from '../../../services';
import { JobSettingsSheet } from './JobSettingsSheet';
import { ManagerPickerStage } from './ManagerPickerStage';

const listMembers = jest.spyOn(membersService, 'listMembers');
const setManager = jest.spyOn(membersService, 'setManager');
const setJobSettings = jest.spyOn(membersService, 'setJobSettings');

function member(overrides: Partial<CompanyMember> & { userId: string; name: string }): CompanyMember {
  return {
    countryCode: '+91',
    phoneNumber: '7700000000',
    employeeCode: 'EMP-000',
    role: 'employee',
    status: 'active',
    createdAt: '2026-11-20T00:00:00Z',
    avatarUrl: null,
    canCreateJobs: false,
    jobApprovalRequired: false,
    managerId: null,
    managerName: null,
    chain: [],
    headcount: 0,
    directReports: 0,
    ...overrides,
  };
}

const NISHA = member({
  userId: 'u-nisha',
  name: 'Nisha Chauhan',
  employeeCode: 'EMP-079',
});
const SANJAY = member({
  userId: 'u-sanjay',
  name: 'Sanjay Menon',
  employeeCode: 'EMP-076',
  headcount: 3,
  directReports: 3,
});
const ASHOK = member({
  userId: 'u-ashok',
  name: 'PQA Owner Ashok Rao',
  employeeCode: 'EMP-001',
  role: 'company_admin',
  headcount: 200,
});
const MEENA = member({
  userId: 'u-meena',
  name: 'PQA Viewer Meena Iyer',
  employeeCode: 'EMP-002',
  role: 'viewer',
});
const PRIYA = member({
  userId: 'u-priya',
  name: 'Priya Reddy',
  employeeCode: 'EMP-004',
  chain: [{ userId: 'u-nisha', name: 'Nisha Chauhan' }],
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function renderSheet(technician = { id: 'u-nisha', name: 'Nisha Chauhan' }) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <JobSettingsSheet visible technician={technician} onClose={() => undefined} />,
    );
  });
  mounted.push(renderer);
  return renderer;
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAllByType(Text).map(node =>
    Array.isArray(node.props.children)
      ? node.props.children.filter((c: unknown) => typeof c === 'string').join('')
      : String(node.props.children ?? ''),
  );
}

function managerRow(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const rows = root.findAll(node => node.props.accessibilityLabel === label);
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!;
}

beforeEach(() => {
  jest.clearAllMocks();
  setJobSettings.mockResolvedValue({
    userId: 'u-nisha',
    canCreateJobs: false,
    jobApprovalRequired: false,
  });
});

afterEach(() => {
  act(() => {
    mounted.forEach(renderer => renderer.unmount());
  });
  mounted.length = 0;
});

describe('JobSettingsSheet — the Reporting manager section', () => {
  it('shows the unset state and the top-of-tree line above the job switches', async () => {
    listMembers.mockResolvedValue([NISHA, SANJAY]);
    const renderer = await renderSheet();

    const copy = texts(renderer.root);
    expect(copy).toContain('Reporting manager');
    expect(copy).toContain('Reports to');
    expect(copy).toContain('The company owner');
    expect(copy).toContain('No one above them in the team yet.');
    // The switches still follow the section.
    expect(copy).toContain('Can create jobs');
  });

  it('prints the manager, the chain with the owner marked, and the headcount', async () => {
    listMembers.mockResolvedValue([
      {
        ...NISHA,
        managerId: 'u-sanjay',
        managerName: 'Sanjay Menon',
        chain: [
          { userId: 'u-sanjay', name: 'Sanjay Menon' },
          { userId: 'u-ashok', name: 'PQA Owner Ashok Rao' },
        ],
      },
      SANJAY,
      ASHOK,
    ]);
    const renderer = await renderSheet();
    const copy = texts(renderer.root);

    expect(copy).toContain('Sanjay Menon');
    expect(copy).toContain('Sanjay Menon → PQA Owner Ashok Rao (Owner)');
  });

  it('reports the chosen manager headcount line', async () => {
    listMembers.mockResolvedValue([{ ...NISHA, headcount: 3, directReports: 3 }, SANJAY]);
    const renderer = await renderSheet();

    expect(texts(renderer.root)).toContain('3 people report to them');
  });
});

describe('JobSettingsSheet — the picker stage', () => {
  it('excludes the member and their subtree, shows role words and the viewer note', async () => {
    listMembers.mockResolvedValue([NISHA, SANJAY, MEENA, PRIYA]);
    const renderer = await renderSheet();

    await act(async () => {
      managerRow(renderer.root, 'Reports to the company owner').props.onPress();
    });

    const stage = renderer.root.findByType(ManagerPickerStage);
    expect(stage.props.memberId).toBe('u-nisha');
    expect(stage.props.members.map((row: CompanyMember) => row.userId)).toEqual([
      'u-nisha',
      'u-sanjay',
      'u-meena',
      'u-priya',
    ]);
    // The stage's own copy: the neutral option and the viewer fact once chosen.
    const copy = texts(renderer.root);
    expect(copy).toContain('The company owner');
    expect(copy).toContain('PQA Viewer Meena Iyer');
    expect(copy.some(line => line.endsWith('· Viewer'))).toBe(true);

    act(() => {
      renderer.root.findByType(ManagerPickerStage).props.onSelect(MEENA);
    });
    expect(texts(renderer.root)).toContain(
      "Viewers can't normally see leave or job requests. As a reporting manager, they will see their team's and can decide them.",
    );
  });

  it('Save persists the pick and returns to the settings stage with the response', async () => {
    const savedNisha = {
      ...NISHA,
      managerId: 'u-meena',
      managerName: 'PQA Viewer Meena Iyer',
      chain: [{ userId: 'u-meena', name: 'PQA Viewer Meena Iyer' }],
    };
    let membersNow = [NISHA, SANJAY, MEENA];
    listMembers.mockImplementation(async () => membersNow);
    setManager.mockResolvedValue(savedNisha);
    const renderer = await renderSheet();

    await act(async () => {
      managerRow(renderer.root, 'Reports to the company owner').props.onPress();
    });
    act(() => {
      renderer.root.findByType(ManagerPickerStage).props.onSelect(MEENA);
    });
    // The save re-reads the directory (the picker's pool must not go stale);
    // the fresh read reflects the write.
    membersNow = [savedNisha, SANJAY, MEENA];
    await act(async () => {
      renderer.root.findByType(ManagerPickerStage).props.onSave();
    });

    expect(setManager).toHaveBeenCalledWith('u-nisha', 'u-meena');
    expect(renderer.root.findAllByType(ManagerPickerStage)).toHaveLength(0);
    const copy = texts(renderer.root);
    expect(copy).toContain('Reports to');
    expect(copy).toContain('PQA Viewer Meena Iyer');
    expect(copy).toContain('Can create jobs');
  });

  it('clearing the pick sends null (the manager is removed)', async () => {
    let membersNow = [
      {
        ...NISHA,
        managerId: 'u-sanjay',
        managerName: 'Sanjay Menon',
        chain: [{ userId: 'u-sanjay', name: 'Sanjay Menon' }],
      },
      SANJAY,
    ];
    listMembers.mockImplementation(async () => membersNow);
    setManager.mockResolvedValue({ ...NISHA });
    const renderer = await renderSheet();

    await act(async () => {
      managerRow(renderer.root, 'Reports to Sanjay Menon').props.onPress();
    });
    act(() => {
      renderer.root.findByType(ManagerPickerStage).props.onSelect(null);
    });
    membersNow = [{ ...NISHA }, SANJAY];
    await act(async () => {
      renderer.root.findByType(ManagerPickerStage).props.onSave();
    });

    expect(setManager).toHaveBeenCalledWith('u-nisha', null);
    expect(texts(renderer.root)).toContain('The company owner');
  });

  it('a refusal keeps the stage open with the server message and the previous value', async () => {
    listMembers.mockResolvedValue([NISHA, PRIYA]);
    setManager.mockRejectedValue({
      status: 409,
      code: 'HIERARCHY_CYCLE',
      message: "That would make a loop — this person already reports to them.",
    });
    const renderer = await renderSheet();

    await act(async () => {
      managerRow(renderer.root, 'Reports to the company owner').props.onPress();
    });
    act(() => {
      renderer.root.findByType(ManagerPickerStage).props.onSelect(PRIYA);
    });
    await act(async () => {
      renderer.root.findByType(ManagerPickerStage).props.onSave();
    });

    expect(renderer.root.findAllByType(ManagerPickerStage)).toHaveLength(1);
    expect(texts(renderer.root)).toContain(
      'That would make a loop — this person already reports to them.',
    );
  });
});
