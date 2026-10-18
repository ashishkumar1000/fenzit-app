/**
 * buildCustomerPick — the customer Confirm payload. A resolved search place
 * wins only while the pin still sits on it; a reverse geocode counts only
 * for the SAME centre; an empty address falls back to the coordinates.
 */
import { buildCustomerPick, sameCentre } from './buildCustomerPick';

const centre = { latitude: 12.9716, longitude: 77.5946 };
const place = (over = {}) =>
  ({
    ...centre,
    formattedAddress: 'MG Road, Bengaluru',
    pincode: '560001',
    city: 'Bengaluru',
    placeId: 'p1',
    ...over,
  } as never);

describe('sameCentre', () => {
  it('matches within ~11 m and not beyond', () => {
    expect(sameCentre(centre, { latitude: 12.97165, longitude: 77.59465 })).toBe(true);
    expect(sameCentre(centre, { latitude: 12.9718, longitude: 77.5946 })).toBe(false);
  });
});

describe('buildCustomerPick', () => {
  it('prefers the resolved place (placeId included) while the pin is on it', () => {
    const out = buildCustomerPick(centre, { centre, place: place() }, null);
    expect(out.snapshot.placeId).toBe('p1');
    expect(out.addressLine).toBe('MG Road, Bengaluru');
    expect(out.city).toBe('Bengaluru');
  });

  it('ignores a resolved place once the pin has moved away', () => {
    const moved = { latitude: 13.5, longitude: 77.6 };
    const out = buildCustomerPick(moved, { centre, place: place() }, null);
    expect(out.snapshot.placeId).toBeNull();
    expect(out.addressLine).toBe('13.50000, 77.60000');
  });

  it('ignores a STALE reverse geocode for a different centre', () => {
    const stale = { centre: { latitude: 20, longitude: 70 }, place: place({ placeId: null }) };
    const out = buildCustomerPick(centre, null, stale);
    expect(out.snapshot.formattedAddress).toBeNull();
    expect(out.addressLine).toBe('12.97160, 77.59460');
  });

  it('uses a fresh reverse geocode (no placeId) and falls back to coordinates on an EMPTY address', () => {
    const fresh = { centre, place: place({ placeId: null }) };
    expect(buildCustomerPick(centre, null, fresh).snapshot.pincode).toBe('560001');
    const empty = { centre, place: place({ formattedAddress: '', placeId: null }) };
    expect(buildCustomerPick(centre, null, empty).addressLine).toBe('12.97160, 77.59460');
  });
});
