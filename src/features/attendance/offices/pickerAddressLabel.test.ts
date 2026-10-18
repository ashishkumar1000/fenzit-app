/**
 * Tests for pickerAddressLabel — the picker card's place text (UX finding 5):
 * a chosen search result keeps its name, plus codes never lead the title,
 * and a pin with no address at all falls back to coordinates.
 */
import { pickerAddressLabel, stripPlusCode } from './pickerAddressLabel';
import type { ResolvedPlace } from '../../../services';

const PIN = { latitude: 12.9352, longitude: 77.6245 };

function place(formattedAddress: string): ResolvedPlace {
  return {
    placeId: 'p1',
    formattedAddress,
    city: 'Bengaluru',
    pincode: '560034',
    latitude: PIN.latitude,
    longitude: PIN.longitude,
  };
}

describe('stripPlusCode', () => {
  it.each([
    ['XPJQ+3WM, Whitefield, Bengaluru', 'Whitefield, Bengaluru'],
    ['WJPF+3RV, Bengaluru', 'Bengaluru'],
    ['xpjq+3wm Whitefield', 'Whitefield'],
    ['Koramangala, Bengaluru', 'Koramangala, Bengaluru'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(stripPlusCode(input)).toBe(expected);
  });

  it('keeps a plus code that is not at the start', () => {
    expect(stripPlusCode('Tower B, XPJQ+3WM')).toBe('Tower B, XPJQ+3WM');
  });

  it('keeps ordinary text containing a plus sign', () => {
    expect(stripPlusCode('Plot 4+5, MG Road')).toBe('Plot 4+5, MG Road');
  });
});

describe('pickerAddressLabel', () => {
  it('prefers the search result the owner chose while the pin is still on it', () => {
    const out = pickerAddressLabel(
      PIN,
      { centre: PIN, place: place('Koramangala, Bengaluru') },
      'WJPF+3RV, Bengaluru',
    );
    expect(out).toEqual({ label: 'Koramangala, Bengaluru', fromSearch: true });
  });

  it('treats a tiny drift (under about 11 m) as still on the result', () => {
    const out = pickerAddressLabel(
      { latitude: PIN.latitude + 0.00005, longitude: PIN.longitude },
      { centre: PIN, place: place('Koramangala, Bengaluru') },
      'Other',
    );
    expect(out.fromSearch).toBe(true);
  });

  it('switches to the reverse address once the pin moves away', () => {
    const out = pickerAddressLabel(
      { latitude: PIN.latitude + 0.01, longitude: PIN.longitude },
      { centre: PIN, place: place('Koramangala, Bengaluru') },
      'HSR Layout, Bengaluru',
    );
    expect(out).toEqual({ label: 'HSR Layout, Bengaluru', fromSearch: false });
  });

  it('strips a plus code from the reverse address', () => {
    expect(pickerAddressLabel(PIN, null, 'XPJQ+3WM, Whitefield, Bengaluru').label).toBe(
      'Whitefield, Bengaluru',
    );
  });

  it('falls back to coordinates when there is no address', () => {
    expect(pickerAddressLabel(PIN, null, null)).toEqual({
      label: '12.93520, 77.62450',
      fromSearch: false,
    });
  });

  it('falls back to coordinates when the address is only a plus code', () => {
    expect(pickerAddressLabel(PIN, null, 'XPJQ+3WM').label).toBe('12.93520, 77.62450');
  });
});
