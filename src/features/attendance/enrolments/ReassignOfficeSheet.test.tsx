/**
 * ReassignOfficeSheet — the employee's current office is shown as such and
 * cannot be picked (moving to it is a no-op the BE would accept silently;
 * UX finding 20).
 */
import { act, create } from 'react-test-renderer';
import { ReassignOfficeSheet } from './ReassignOfficeSheet';
import type { Office } from '../../../types/office';

function office(id: string, name: string): Office {
  return {
    id,
    name,
    latitude: 19.1,
    longitude: 72.8,
    radiusM: 100,
    archivedAt: null,
    rule: null,
  } as unknown as Office;
}

const OFFICES = [office('o1', 'Andheri'), office('o2', 'Thane')];

function renderSheet(currentOfficeId: string | null, onConfirm = jest.fn()) {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(
      <ReassignOfficeSheet
        visible
        employeeName="Priya"
        offices={OFFICES}
        currentOfficeId={currentOfficeId}
        defaultEffectiveFrom="2026-10-18"
        minEffectiveFrom="2026-10-18"
        effectiveFrom="2026-10-18"
        onEffectiveFromChange={jest.fn()}
        onPickDate={jest.fn()}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );
  });
  const press = (label: string) =>
    r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
  return { r, press, onConfirm };
}

describe('ReassignOfficeSheet current office', () => {
  it('labels the current office and disables it', () => {
    const { press } = renderSheet('o1');
    const row = press('Andheri, current office')[0];
    expect(row).toBeDefined();
    expect(row.props.disabled).toBe(true);
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('does not offer "Move Priya to" the current office', () => {
    const { press } = renderSheet('o1');
    expect(press('Move Priya to Andheri')).toHaveLength(0);
  });

  it('leaves the other offices pickable', () => {
    const { press } = renderSheet('o1');
    const row = press('Move Priya to Thane')[0];
    expect(row.props.disabled).toBeFalsy();
  });

  it('picking another office enables a confirm that sends that office', () => {
    const { r, press, onConfirm } = renderSheet('o1');
    act(() => press('Move Priya to Thane')[0].props.onPress());
    const confirm = r.root.findAll((n) => n.props?.children === 'Move to Thane' && n.props.onPress);
    expect(confirm.length).toBeGreaterThan(0);
    act(() => confirm[0].props.onPress());
    expect(onConfirm).toHaveBeenCalledWith('o2', '2026-10-18');
  });

  it('with no current office, every office is pickable', () => {
    const { press } = renderSheet(null);
    expect(press('Move Priya to Andheri')).toHaveLength(1);
    expect(press('Move Priya to Thane')).toHaveLength(1);
  });
});

describe('ReassignOfficeSheet dead end', () => {
  it('explains when the current office is the only one', () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <ReassignOfficeSheet
          visible
          employeeName="Priya"
          offices={[OFFICES[0]]}
          currentOfficeId="o1"
          defaultEffectiveFrom="2026-10-18"
          minEffectiveFrom="2026-10-18"
          effectiveFrom="2026-10-18"
          onEffectiveFromChange={jest.fn()}
          onPickDate={jest.fn()}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
        />,
      );
    });
    const texts = r.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
    expect(texts).toContain('This is the only office. Add another office to move Priya.');
  });

  it('says nothing extra when other offices exist', () => {
    const { r } = renderSheet('o1');
    const texts = r.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
    expect(texts.some((t: string) => t.startsWith('This is the only office'))).toBe(false);
  });
});
