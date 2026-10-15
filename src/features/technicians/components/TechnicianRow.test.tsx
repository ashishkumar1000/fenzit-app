/**
 * TechnicianRow — the employee-code line (SPEC-human-readable-ids, CAP-3).
 * A hydrated roster row renders `EMP-004 · <phone>` on the muted line; a
 * freshly invited row (code not yet hydrated) renders the phone alone —
 * fail-hidden, never `EMP-undefined`. Strings are collected by walking the
 * tree and joined, because the phone Text's children are an expression list
 * when the code is present (RTR exact-match on array children is a trap).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { TechnicianRow } from './TechnicianRow';
import type { Technician } from '../types';

const BASE: Technician = {
  id: 'tech-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phone: '9111111111',
  status: 'active',
  invitedAt: '2026-06-01T00:00:00Z',
  skillIds: ['skill-1'],
};

function renderRow(technician: Technician) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<TechnicianRow technician={technician} onPress={() => {}} />);
  });
  const strings: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance) => {
    const { children } = node.props as { children?: unknown };
    if (typeof children === 'string') strings.push(children);
    if (Array.isArray(children)) {
      for (const c of children) if (typeof c === 'string') strings.push(c);
    }
    node.children.forEach(child => {
      if (typeof child === 'string') strings.push(child);
      else walk(child as ReactTestRenderer.ReactTestInstance);
    });
  };
  walk(renderer.root);
  return strings;
}

describe('TechnicianRow employee code', () => {
  it('prefixes the phone line with the code when the roster carries one', () => {
    const strings = renderRow({ ...BASE, employeeCode: 'EMP-004' });
    expect(strings.join('')).toContain('EMP-004 · 9111111111');
    expect(strings).toContain('Ravi Kumar');
  });

  it('stays name + phone only when the code has not hydrated yet', () => {
    const strings = renderRow(BASE);
    expect(strings.join('')).toContain('9111111111');
    expect(strings.join('')).not.toContain('EMP-');
    expect(strings.join('')).not.toContain('undefined');
  });
});
