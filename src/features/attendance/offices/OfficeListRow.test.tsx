/**
 * OfficeListRow — the pin's address on the Offices card: shown as a short
 * place name (no country, no "State PINCODE" tail), absent when none was
 * saved, muted on archived rows, and spoken in full for screen readers.
 */
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import OfficeListRow, { officeCardAddress } from './OfficeListRow';
import type { Office } from '../../../types/office';

const FULL = 'Mana Placido Apartments, Pattandur Agrahara, Whitefield, Bengaluru, Karnataka 560066, India';

function office(over: Partial<Office> = {}): Office {
  return {
    id: 'o1',
    name: 'Mana',
    latitude: 12.97,
    longitude: 77.73,
    radiusM: 100,
    archivedAt: null,
    rule: {
      id: 'r1',
      startTime: '09:30',
      endTime: '18:30',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
      validFrom: '2026-10-18',
      validTo: null,
    },
    nextRule: null,
    ...over,
  };
}

function render(o: Office) {
  let r!: ReturnType<typeof create>;
  act(() => {
    r = create(<OfficeListRow office={o} onPress={jest.fn()} />);
  });
  const texts = () => r.root.findAllByType(Text).map((t) => String(t.props.children));
  const card = () =>
    r.root.findAll((n) => typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Office '))[0];
  return { r, texts, card };
}

describe('officeCardAddress', () => {
  it.each([
    [FULL, 'Mana Placido Apartments, Pattandur Agrahara, Whitefield, Bengaluru'],
    ['Koramangala, Bengaluru, Karnataka 560034, India', 'Koramangala, Bengaluru'],
    ['Koramangala, Bengaluru', 'Koramangala, Bengaluru'],
    ['12 MG Road, Pune, Maharashtra 411001', '12 MG Road, Pune'],
    ['Koramangala, Bengaluru, INDIA', 'Koramangala, Bengaluru'],
    ['  Koramangala ,  Bengaluru , ', 'Koramangala, Bengaluru'],
  ])('%s → %s', (input, expected) => {
    expect(officeCardAddress(input)).toBe(expected);
  });

  it('never trims a short address down to nothing', () => {
    expect(officeCardAddress('Bengaluru, India')).toBe('Bengaluru, India');
    expect(officeCardAddress('India')).toBe('India');
    expect(officeCardAddress('Karnataka 560066')).toBe('Karnataka 560066');
  });

  it('keeps a street number that is not a PIN tail', () => {
    expect(officeCardAddress('Plot 42, Sector 9, Noida')).toBe('Plot 42, Sector 9, Noida');
  });

  it('returns the original when it has no usable parts', () => {
    expect(officeCardAddress(',,')).toBe(',,');
  });
});

describe('OfficeListRow address', () => {
  it('shows the short place name, not the full address', () => {
    const { texts } = render(office({ formattedAddress: FULL }));
    expect(texts()).toContain('Mana Placido Apartments, Pattandur Agrahara, Whitefield, Bengaluru');
    expect(texts().some((t) => t.includes('560066'))).toBe(false);
  });

  it.each([null, undefined, '', '   '])('shows no address line for %p', (value) => {
    const { texts } = render(office({ formattedAddress: value as string | null | undefined }));
    expect(texts().some((t) => t.includes('Bengaluru') || t.includes('Mana Placido'))).toBe(false);
  });

  it('speaks the FULL address in the card label', () => {
    const { card } = render(office({ formattedAddress: FULL }));
    expect(card().props.accessibilityLabel).toBe(`Office Mana, ${FULL}`);
  });

  it('keeps the plain label when there is no address', () => {
    const { card } = render(office());
    expect(card().props.accessibilityLabel).toBe('Office Mana');
  });

  it('the street-map drawing is hidden from screen readers and takes no touches', () => {
    const { r } = render(office({ formattedAddress: FULL }));
    const art = r.root.findAll(
      (n) => n.props?.importantForAccessibility === 'no-hide-descendants' && n.props?.pointerEvents === 'none',
    );
    expect(art.length).toBeGreaterThan(0);
  });

  it('archived offices still show their address, and stay non-pressable', () => {
    const { texts, card } = render(office({ formattedAddress: FULL, archivedAt: '2026-10-01T00:00:00Z', rule: null }));
    expect(texts()).toContain('Mana Placido Apartments, Pattandur Agrahara, Whitefield, Bengaluru');
    expect(card().props.disabled).toBe(true);
  });

  it('archived card footer carries the archive date', () => {
    const { texts } = render(office({ archivedAt: '2026-10-01T00:00:00Z' }));
    expect(texts().some((t) => t.startsWith('Archived ') && !t.includes('Invalid'))).toBe(true);
  });

  it('active card footer says when the timings start; no footer at all without a start date or rule', () => {
    expect(render(office()).texts().some((t) => t.startsWith('Valid from '))).toBe(true);
    const noDate = render(office({ rule: { ...office().rule!, validFrom: '' } }));
    expect(noDate.texts().some((t) => t.startsWith('Valid from') || t.startsWith('Archived'))).toBe(false);
    expect(noDate.r.root.findAll((n) => n.props?.name === 'CalendarDays').length).toBe(0);
    expect(render(office({ rule: null })).texts().some((t) => t.startsWith('Valid from'))).toBe(false);
  });
});
