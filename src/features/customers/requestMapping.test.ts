/**
 * Tests for the customer request/seed mapping: the create merge
 * (`toCreateCustomerRequest`, whose payload shapes are pinned end-to-end in
 * `AddCustomerScreen.test.tsx`) and the edit side — `toCustomerFormSeed`
 * (detail → form + baseline) and `buildCustomerUpdatePatch` (the diff-gated
 * PATCH contract, SPEC-edit-customer CAP-4/CAP-5). These are the purest
 * statement of the edit rules: changed keys only, explicit-null clears, the
 * location block replaced as a unit, `addressDetails` cleared only by
 * emptying the Flat field.
 */
import {
  buildCustomerUpdatePatch,
  toCustomerFormSeed,
  toCreateCustomerRequest,
} from './requestMapping';
import type { PickedAddressSnapshot } from './types';
import type { CustomerDetail } from '../../services';

/** A fully-populated pinned customer, exactly what GET /customers/:id
 *  returns for a customer created from a resolved search place. */
function makeDetail(overrides: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: 'cust-77',
    name: 'Priya Sharma',
    countryCode: '+91',
    phoneNumber: '9876543210',
    address: '12 MG Road',
    city: 'Bengaluru',
    formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001, India',
    pincode: '560001',
    latitude: 12.9716,
    longitude: 77.5946,
    placeId: 'place-9',
    addressDetails: 'Flat 302, Tower B',
    createdVia: 'manual',
    createdAt: '2026-06-21T00:00:00Z',
    tenantId: 't-1',
    jobHistory: { data: [], nextCursor: null, hasMore: false },
    ...overrides,
  };
}

/** A pin drop on an open-water point: coordinates only, every text field
 *  null — the hardest case for the block-replacement nulls. */
const BARE_PIN: PickedAddressSnapshot = {
  formattedAddress: null,
  pincode: null,
  latitude: 18.559,
  longitude: 73.7868,
  placeId: null,
};

describe('toCustomerFormSeed', () => {
  it('seeds the form from the stored row — the merged address line goes to Street, Area stays empty', () => {
    const seed = toCustomerFormSeed(makeDetail());

    expect(seed.name).toBe('Priya Sharma');
    expect(seed.phone).toBe('9876543210');
    expect(seed.street).toBe('12 MG Road');
    expect(seed.area).toBe('');
    expect(seed.city).toBe('Bengaluru');
    expect(seed.addressDetails).toBe('Flat 302, Tower B');
  });

  it('reconstructs the snapshot only when coordinates exist, and shares it with the baseline', () => {
    const seed = toCustomerFormSeed(makeDetail());

    expect(seed.snapshot).toEqual({
      formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001, India',
      pincode: '560001',
      latitude: 12.9716,
      longitude: 77.5946,
      placeId: 'place-9',
    });
    // Reference equality with the baseline IS the "no new pick yet" marker
    // the diff relies on — one shared instance, not two lookalikes.
    expect(seed.baseline.snapshot).toBe(seed.snapshot);
  });

  it('a manual-entry customer (no coordinates) seeds no snapshot and an empty preview', () => {
    const seed = toCustomerFormSeed(
      makeDetail({
        address: null,
        formattedAddress: null,
        pincode: null,
        latitude: null,
        longitude: null,
        placeId: null,
      }),
    );

    expect(seed.snapshot).toBeNull();
    expect(seed.previewLine).toBe('');
  });

  it('the preview line falls back to the raw coordinates for a pin with no resolved text', () => {
    const seed = toCustomerFormSeed(
      makeDetail({ formattedAddress: null }),
    );

    expect(seed.previewLine).toBe('12.97160, 77.59460');
  });

  it('trims the baseline strings so a legacy whitespace-suffixed row is not perpetually dirty', () => {
    const seed = toCustomerFormSeed(
      makeDetail({
        name: '  Priya Sharma ',
        address: ' 12 MG Road ',
        city: ' Bengaluru ',
        addressDetails: ' Flat 302 ',
      }),
    );

    expect(seed.baseline).toEqual({
      name: 'Priya Sharma',
      address: '12 MG Road',
      city: 'Bengaluru',
      addressDetails: 'Flat 302',
      snapshot: seed.baseline.snapshot,
    });
  });
});

describe('buildCustomerUpdatePatch', () => {
  it('an untouched form diffs to an empty patch — the no-op save contract', () => {
    const seed = toCustomerFormSeed(makeDetail());

    expect(
      buildCustomerUpdatePatch(
        {
          name: seed.name,
          street: seed.street,
          area: seed.area,
          city: seed.city,
          addressDetails: seed.addressDetails,
          snapshot: seed.snapshot,
        },
        seed.baseline,
      ),
    ).toEqual({});
  });

  it('a name change sends exactly the name', () => {
    const seed = toCustomerFormSeed(makeDetail());

    const patch = buildCustomerUpdatePatch(
      { name: 'Priya Reddy', street: seed.street, area: seed.area, city: seed.city, addressDetails: seed.addressDetails, snapshot: seed.snapshot },
      seed.baseline,
    );

    expect(patch).toEqual({ name: 'Priya Reddy' });
  });

  it('Street/Area edits merge into one address key, compared against the stored line', () => {
    const seed = toCustomerFormSeed(makeDetail());

    const patch = buildCustomerUpdatePatch(
      { name: seed.name, street: '9 Church Street', area: 'Bengaluru', city: seed.city, addressDetails: seed.addressDetails, snapshot: seed.snapshot },
      seed.baseline,
    );

    expect(patch).toEqual({ address: '9 Church Street, Bengaluru' });
  });

  it('emptying Street and Area sends an explicit address null (the clear)', () => {
    const seed = toCustomerFormSeed(makeDetail());

    const patch = buildCustomerUpdatePatch(
      { name: seed.name, street: '', area: '', city: seed.city, addressDetails: seed.addressDetails, snapshot: seed.snapshot },
      seed.baseline,
    );

    expect(patch).toEqual({ address: null });
  });

  it('emptying City or the Flat field sends explicit nulls — the CAP-5 clear', () => {
    const seed = toCustomerFormSeed(makeDetail());

    const cityCleared = buildCustomerUpdatePatch(
      { name: seed.name, street: seed.street, area: seed.area, city: '', addressDetails: seed.addressDetails, snapshot: seed.snapshot },
      seed.baseline,
    );
    expect(cityCleared).toEqual({ city: null });

    const detailsCleared = buildCustomerUpdatePatch(
      { name: seed.name, street: seed.street, area: seed.area, city: seed.city, addressDetails: '', snapshot: seed.snapshot },
      seed.baseline,
    );
    expect(detailsCleared).toEqual({ addressDetails: null });
  });

  it('a re-pin replaces the block as a unit — absent pick fields travel as explicit nulls', () => {
    const seed = toCustomerFormSeed(makeDetail());

    const patch = buildCustomerUpdatePatch(
      { name: seed.name, street: seed.street, area: seed.area, city: seed.city, addressDetails: seed.addressDetails, snapshot: BARE_PIN },
      seed.baseline,
    );

    expect(patch).toEqual({
      formattedAddress: null,
      pincode: null,
      latitude: 18.559,
      longitude: 73.7868,
      placeId: null,
    });
    // CAP-5: the Flat field is the user's own text — a re-pin never touches it.
    expect(patch).not.toHaveProperty('addressDetails');
  });

  it('a manual-entry pick over a pinned customer nulls all five block keys', () => {
    const seed = toCustomerFormSeed(makeDetail());

    const patch = buildCustomerUpdatePatch(
      { name: seed.name, street: seed.street, area: seed.area, city: seed.city, addressDetails: seed.addressDetails, snapshot: null },
      seed.baseline,
    );

    expect(patch).toEqual({
      formattedAddress: null,
      pincode: null,
      latitude: null,
      longitude: null,
      placeId: null,
    });
  });

  it('a manual pick over an UNpinned customer is not a block change at all', () => {
    const seed = toCustomerFormSeed(
      makeDetail({
        formattedAddress: null,
        pincode: null,
        latitude: null,
        longitude: null,
        placeId: null,
      }),
    );

    const patch = buildCustomerUpdatePatch(
      { name: seed.name, street: seed.street, area: seed.area, city: seed.city, addressDetails: seed.addressDetails, snapshot: null },
      seed.baseline,
    );

    expect(patch).toEqual({});
  });

  it('even a same-spot re-pin rewrites the block (every pick is a fresh object)', () => {
    const seed = toCustomerFormSeed(makeDetail());

    const sameSpot: PickedAddressSnapshot = {
      formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001, India',
      pincode: '560001',
      latitude: 12.9716,
      longitude: 77.5946,
      placeId: 'place-9',
    };

    const patch = buildCustomerUpdatePatch(
      { name: seed.name, street: seed.street, area: seed.area, city: seed.city, addressDetails: seed.addressDetails, snapshot: sameSpot },
      seed.baseline,
    );

    expect(patch).toEqual({
      formattedAddress: sameSpot.formattedAddress,
      pincode: sameSpot.pincode,
      latitude: sameSpot.latitude,
      longitude: sameSpot.longitude,
      placeId: sameSpot.placeId,
    });
  });

  it('whitespace-only edits are not diffs — current is trimmed against the trimmed baseline', () => {
    // A legacy row stored before the DTO trims: the baseline trims the
    // stored values, so a form seeded from them diffs to nothing.
    const seed = toCustomerFormSeed(
      makeDetail({
        name: ' Priya Sharma ',
        address: ' 12 MG Road ',
        city: ' Bengaluru ',
        addressDetails: ' Flat 302, Tower B ',
      }),
    );

    const patch = buildCustomerUpdatePatch(
      { name: ' Priya Sharma ', street: ' 12 MG Road ', area: '', city: ' Bengaluru ', addressDetails: ' Flat 302, Tower B ', snapshot: seed.snapshot },
      seed.baseline,
    );

    expect(patch).toEqual({});
  });

  it('the create-side merge stays single-sourced — the edit diff compares the exact create composition', () => {
    // The rule the whole edit mapping rests on: create stored
    // "[street], [area]" via toCreateCustomerRequest; the seed hands the
    // stored line back and the diff re-merges with the same join.
    expect(
      toCreateCustomerRequest({
        name: 'X',
        phone: '9876543210',
        address: '9 Church Street',
        area: 'Bengaluru',
        city: 'Bengaluru',
      }).address,
    ).toBe('9 Church Street, Bengaluru');
  });
});
