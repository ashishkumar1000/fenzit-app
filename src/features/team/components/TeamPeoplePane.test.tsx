/**
 * TeamPeoplePane — the People segment's directory (Epic 24, 24-5): every
 * status carries its badge word exactly once, the caption explains why an
 * inactive row cannot be picked, and the apply action exists only for an
 * employee manager.
 */
import { act, create } from 'react-test-renderer';
import type ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { Button } from '../../../components/ui';
import type { TeamSummary } from '../../../services';
import { TeamPeoplePane } from './TeamPeoplePane';

const team: TeamSummary = {
  managerId: 'u-owner',
  managerName: 'PQA Owner Ashok Rao',
  chain: [],
  headcount: 3,
  directReports: 3,
  members: [
    { userId: 'u-riya', name: 'Riya Nair', employeeCode: 'EMP-004', status: 'active', avatarUrl: null },
    { userId: 'u-dee', name: 'Deepa Rao', employeeCode: 'EMP-005', status: 'invited', avatarUrl: null },
    { userId: 'u-amit', name: 'Amit Shah', employeeCode: 'EMP-006', status: 'deactivated', avatarUrl: null },
  ],
};

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map(node =>
    Array.isArray(node.props.children)
      ? node.props.children.filter((c: unknown) => typeof c === 'string').join('')
      : String(node.props.children),
  );
}

async function renderPane(
  canApply: boolean,
  onApplyFor = jest.fn(),
): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <TeamPeoplePane team={team} canApply={canApply} onApplyFor={onApplyFor} />,
    );
  });
  return renderer;
}

it('prints each status word once, with the explanation in the caption', async () => {
  const renderer = await renderPane(true);
  const copy = texts(renderer);

  // `EXPERIENCE` wants a badge on every row — never the word twice: the
  // badge owns the status word, the caption owns the explanation.
  expect(copy.filter(line => line === 'Active')).toHaveLength(1);
  expect(copy).toContain('Invited');
  expect(copy.some(line => line.includes('Not joined yet'))).toBe(true);
  expect(copy).toContain('Deactivated');
  expect(copy.some(line => line.includes('No longer active'))).toBe(true);
  // The status word is not repeated in the caption line.
  expect(copy).toContain('EMP-004');
  expect(copy).not.toContain('EMP-004 · Active');
});

it('an employee manager gets the apply action and pickable active rows only', async () => {
  const onApplyFor = jest.fn();
  const renderer = await renderPane(true, onApplyFor);

  const apply = renderer.root
    .findAllByType(Button)
    .find(button => button.props.children === 'Apply for leave');
  expect(apply).toBeDefined();

  const rows = renderer.root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      String(node.props.accessibilityLabel ?? '').startsWith('Apply for leave for'),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].props.accessibilityLabel).toBe('Apply for leave for Riya Nair');

  await act(async () => {
    rows[0].props.onPress();
  });
  expect(onApplyFor).toHaveBeenCalledWith(team.members![0]);
});

it('a viewer manager sees no apply action and no pickable rows', async () => {
  const renderer = await renderPane(false);

  expect(
    renderer.root.findAllByType(Button).find(b => b.props.children === 'Apply for leave'),
  ).toBeUndefined();
  expect(
    renderer.root.findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        String(node.props.accessibilityLabel ?? '').startsWith('Apply for leave for'),
    ),
  ).toHaveLength(0);
});
