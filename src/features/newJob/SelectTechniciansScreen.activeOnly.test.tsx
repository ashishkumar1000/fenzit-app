/**
 * SelectTechniciansScreen in `activeOnly` mode (the weekly-off employee
 * picker, R-18/R-23): its own title, subtitle and search copy; the roster is
 * alphabetical (case-insensitive, nameless last); malformed rows (no phone,
 * no code, no name) must not crash render or search. The job-assignment copy
 * stays unchanged for New Job.
 */
jest.mock('../profile', () => ({
  useMyProfile: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import SelectTechniciansScreen from './SelectTechniciansScreen';
import { useMyProfile } from '../profile';

const useMyProfileMock = useMyProfile as jest.Mock;

const tech = (id: string, name: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  countryCode: '+91',
  phoneNumber: '9000000000',
  status: 'active',
  skills: [],
  skillIds: [],
  createdAt: '2026-09-01T10:00:00Z',
  ...extra,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  while (mounted.length) act(() => mounted.pop()?.unmount());
});

function setRoster(technicians: unknown[]) {
  useMyProfileMock.mockReturnValue({
    profile: { technicians },
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });
}

function renderScreen(activeOnly: boolean) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = create(
      <SelectTechniciansScreen
        navigation={{ goBack: jest.fn(), popTo: jest.fn(), navigate: jest.fn() } as never}
        route={{ params: activeOnly ? { activeOnly: true } : undefined } as never}
      />,
    );
  });
  mounted.push(r);
  return r.root;
}

const flat = (c: unknown): string =>
  Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '';

function allTexts(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map((t) => flat(t.props.children));
}

/** Row names in render order: the bodyStrong name Text of each row. */
function rowNames(root: ReactTestRenderer.ReactTestInstance, names: string[]) {
  return allTexts(root).filter((t) => names.includes(t));
}

function typeSearch(root: ReactTestRenderer.ReactTestInstance, q: string) {
  const input = root.findByType(TextInput);
  act(() => {
    input.props.onChangeText(q);
  });
}

describe('activeOnly copy', () => {
  beforeEach(() => setRoster([tech('a', 'Asha')]));

  it('uses the employee wording', () => {
    const root = renderScreen(true);
    const t = allTexts(root);
    expect(t).toContain('Pick an employee');
    expect(t).toContain('Choose who this weekly off is for.');
    expect(root.findByType(TextInput).props.placeholder).toBe('Search employees');
    expect(t).not.toContain('Select technicians');
  });

  it('keeps the job wording for the New Job flow', () => {
    const root = renderScreen(false);
    const t = allTexts(root);
    expect(t).toContain('Select technicians');
    expect(t).toContain('Choose who will do the job.');
    expect(root.findByType(TextInput).props.placeholder).toBe('Search technicians');
  });
});

describe('alphabetical order and odd rows', () => {
  it('sorts case-insensitively; nameless rows go last', () => {
    setRoster([
      tech('1', 'zoya'),
      tech('2', 'Bala'),
      tech('3', null),
      tech('4', 'asha'),
      tech('5', 'Chitra'),
    ]);
    const root = renderScreen(true);
    expect(rowNames(root, ['zoya', 'Bala', 'asha', 'Chitra'])).toEqual([
      'asha',
      'Bala',
      'Chitra',
      'zoya',
    ]);
  });

  // Defect R-23.
  it('the same alphabetical order applies in the job flow', () => {
    setRoster([tech('1', 'Meera'), tech('2', 'Anil')]);
    expect(rowNames(renderScreen(false), ['Meera', 'Anil'])).toEqual(['Anil', 'Meera']);
  });

  it('numbers sort by value ("Emp 2" before "Emp 10")', () => {
    setRoster([tech('1', 'Emp 10'), tech('2', 'Emp 2')]);
    expect(rowNames(renderScreen(true), ['Emp 10', 'Emp 2'])).toEqual(['Emp 2', 'Emp 10']);
  });

  it('rows missing phone and code render, and searching by name or digits does not crash', () => {
    setRoster([
      tech('1', 'Asha', { phoneNumber: undefined, countryCode: undefined }),
      tech('2', 'Bala', { phoneNumber: null, employeeCode: null }),
    ]);
    const root = renderScreen(true);
    expect(() => typeSearch(root, 'bal')).not.toThrow();
    expect(rowNames(root, ['Asha', 'Bala'])).toEqual(['Bala']);
    expect(() => typeSearch(root, '9000')).not.toThrow();
    expect(allTexts(root).some((t) => t.startsWith('No technicians match'))).toBe(true);
    expect(() => typeSearch(root, 'EMP-1')).not.toThrow();
  });

  it('search results keep alphabetical order', () => {
    setRoster([tech('1', 'Ravi Z'), tech('2', 'Ravi A')]);
    const root = renderScreen(true);
    typeSearch(root, 'ravi');
    expect(rowNames(root, ['Ravi Z', 'Ravi A'])).toEqual(['Ravi A', 'Ravi Z']);
  });

  it('an invited employee is excluded even when alphabetically first', () => {
    setRoster([tech('1', 'Aaron', { status: 'invited' }), tech('2', 'Zed')]);
    const root = renderScreen(true);
    expect(rowNames(root, ['Aaron', 'Zed'])).toEqual(['Zed']);
  });
});
