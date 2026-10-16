/**
 * Render/filter tests for the shared sheet-variant TechnicianPicker (the
 * Edit-job sheet's technician section):
 *
 * - the search runs the ONE shared `filterTechnicians` (name, phone digits,
 *   employee-code digits) — asserted here from the consumer side: a code
 *   finds the row in both variants;
 * - tiles carry the employee code as a caption; rows combine
 *   `code · skills` into one meta line;
 * - the no-match copy is search-generic (codes/phones match too, so "that
 *   name" would read wrong).
 *
 * Presentational — the parent owns the list and the selection.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { TechnicianPicker } from './TechnicianPicker';
import type { ProfileTechnician } from '../services';

const make = (overrides: Partial<ProfileTechnician>): ProfileTechnician => ({
  id: 't-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000001',
  status: 'active',
  skills: ['Plumbing'],
  skillIds: ['s-1'],
  createdAt: '2026-09-01T10:00:00Z',
  ...overrides,
});

const ROSTER: ProfileTechnician[] = [
  make({ id: 't-1', name: 'Ravi Kumar', employeeCode: 'EMP-104' }),
  make({ id: 't-2', name: 'Anita Sharma', employeeCode: 'EMP-002', skills: ['Electrical'] }),
  make({ id: 't-3', name: 'Gopal Menon', skills: [] }),
];

function renderPicker(variant: 'tiles' | 'rows') {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <TechnicianPicker
        technicians={ROSTER}
        selectedId={null}
        onSelect={() => {}}
        variant={variant}
      />,
    );
  });
  return renderer.root;
}

/** Joins a Text node's children — JSX interpolation yields arrays. */
function nodeText(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number')
    return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join('');
  return '';
}

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAllByType(Text).map(t => nodeText(t.props.children));
}

function typeIntoSearch(
  root: ReactTestRenderer.ReactTestInstance,
  text: string,
) {
  const input = root.findAllByType(TextInput)[0];
  act(() => {
    input.props.onChangeText(text);
  });
}

describe('TechnicianPicker (shared, sheet variant)', () => {
  it('tiles show the employee code caption; a code search filters to that tile', () => {
    const root = renderPicker('tiles');
    expect(texts(root)).toContain('EMP-104');

    typeIntoSearch(root, 'emp-002');
    const after = texts(root);
    expect(after).toContain('Anita Sharma');
    expect(after).not.toContain('Ravi Kumar');
  });

  it('rows combine code and skills into one meta line; a bare code number searches', () => {
    const root = renderPicker('rows');
    expect(texts(root)).toContain('EMP-002 · Electrical');
    // No code and no skills → no meta line at all (no dangling separator).
    expect(texts(root).some(t => t.startsWith(' ·') || t.endsWith('· '))).toBe(false);

    typeIntoSearch(root, '104');
    const after = texts(root);
    expect(after).toContain('Ravi Kumar');
    expect(after).not.toContain('Gopal Menon');
  });

  it('the no-match copy is search-generic, not name-specific', () => {
    const root = renderPicker('tiles');
    typeIntoSearch(root, 'zzz');
    expect(texts(root)).toContain('No technician matches that search.');
  });
});
