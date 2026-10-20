import { formatRole } from './format';

describe('formatRole — plain names, never the wire value', () => {
  it.each([
    ['company_admin', 'Admin'],
    ['employee', 'Employee'],
    ['viewer', 'Viewer'],
  ])('%s -> %s', (role, label) => {
    expect(formatRole(role)).toBe(label);
  });

  it.each([null, undefined, '', 'owner', 'technician', 'platform_admin', 'Company_Admin'])(
    'shows nothing for %p rather than a raw code',
    role => {
      expect(formatRole(role)).toBe('');
    },
  );
});
