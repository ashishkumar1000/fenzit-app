/**
 * The `/customers` resource wrappers: `apiClient` is mocked so the tests pin
 * the wire contract — method, path, body, and the `res.data` unwrap — with
 * no network. Mirrors the boundary `users.test.ts` uses for its wrappers.
 * The `update` contract (SPEC-edit-customer) is the load-bearing one: a diff
 * PATCH carrying explicit-null clears verbatim. Phone immutability is a
 * compile-time property (UpdateCustomerRequest structurally omits the phone
 * keys) plus a behavioral one pinned on the screen (read-only field, exact
 * patch payloads) — not re-testable here.
 */
jest.mock('./../api/apiClient', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from '../api/apiClient';
import { customerService } from './customers';
import type { UpdateCustomerRequest } from './customers';

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const CREATED = {
  id: 'cust-1',
  name: 'Priya Sharma',
  countryCode: '+91',
  phoneNumber: '9876543210',
  address: null,
  city: null,
};

describe('customerService.create', () => {
  it('POSTs /customers with the payload and returns the created row', async () => {
    post.mockResolvedValueOnce({ data: CREATED });

    const result = await customerService.create({
      name: 'Priya Sharma',
      countryCode: '+91',
      phoneNumber: '9876543210',
    });

    expect(post).toHaveBeenCalledWith('/customers', {
      name: 'Priya Sharma',
      countryCode: '+91',
      phoneNumber: '9876543210',
    });
    expect(result).toEqual(CREATED);
  });
});

describe('customerService.getById', () => {
  it('GETs /customers/:id (cursor optional) and returns the payload', async () => {
    get.mockResolvedValueOnce({ data: { ...CREATED, jobHistory: { data: [], nextCursor: null, hasMore: false } } });

    const result = await customerService.getById('cust-1');

    expect(get).toHaveBeenCalledWith('/customers/cust-1', {});
    expect(result.name).toBe('Priya Sharma');
  });

  it('passes the cursor and abort signal through', async () => {
    get.mockResolvedValueOnce({ data: {} });
    const controller = new AbortController();

    await customerService.getById('cust-1', 'cursor-9', controller.signal);

    expect(get).toHaveBeenCalledWith('/customers/cust-1', {
      params: { cursor: 'cursor-9' },
      signal: controller.signal,
    });
  });
});

describe('customerService.update (SPEC-edit-customer CAP-4)', () => {
  it('PATCHes /customers/:id with the diff body and returns the updated row', async () => {
    patch.mockResolvedValueOnce({ data: { ...CREATED, name: 'Priya Reddy' } });
    const body: UpdateCustomerRequest = { name: 'Priya Reddy' };

    const result = await customerService.update('cust-1', body);

    expect(patch).toHaveBeenCalledWith('/customers/cust-1', { name: 'Priya Reddy' });
    expect(result.name).toBe('Priya Reddy');
  });

  it('sends explicit nulls verbatim — the wire semantics the diff builder relies on', async () => {
    patch.mockResolvedValueOnce({ data: {} });

    // A re-pin nulling the whole block + the CAP-5 explicit clear of the
    // user's own Flat text — the body must reach the wire untouched.
    await customerService.update('cust-1', {
      formattedAddress: null,
      pincode: null,
      latitude: null,
      longitude: null,
      placeId: null,
      addressDetails: null,
    });

    expect(patch).toHaveBeenCalledWith('/customers/cust-1', {
      formattedAddress: null,
      pincode: null,
      latitude: null,
      longitude: null,
      placeId: null,
      addressDetails: null,
    });
  });

});
