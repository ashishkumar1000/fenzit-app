/**
 * NoAccessScreen — a removed person and Fenzit staff see one plain message
 * and a way out. Never a dead end, never company data.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockLogOut = jest.fn();
jest.mock('../useLogOut', () => ({ useLogOut: () => mockLogOut }));

import NoAccessScreen from './NoAccessScreen';
import { Button } from '../../../components/ui';
import { NO_COMPANY_MESSAGE, PLATFORM_ADMIN_MESSAGE } from '../noAccessCopy';

function render(platformAdmin: boolean) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<NoAccessScreen platformAdmin={platformAdmin} />);
  });
  return r;
}

const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).flatMap(t => [t.props.children].flat().filter(c => typeof c === 'string'));

beforeEach(() => jest.clearAllMocks());

it('tells a person with no company how to get in, in plain English', () => {
  const all = texts(render(false));
  expect(all).toContain(NO_COMPANY_MESSAGE);
  expect(NO_COMPANY_MESSAGE).toBe('You are not part of a company. Ask your company admin to invite you.');
});

it('tells Fenzit staff to use the web admin', () => {
  const all = texts(render(true));
  expect(all).toContain(PLATFORM_ADMIN_MESSAGE);
  expect(PLATFORM_ADMIN_MESSAGE).toBe('Fenzit staff use the web admin.');
  expect(all).not.toContain(NO_COMPANY_MESSAGE);
});

it.each([false, true])('always offers Log out (platformAdmin=%s) and it logs out', platformAdmin => {
  const r = render(platformAdmin);
  const logOut = r.root.findAllByType(Button).find(b => b.props.children === 'Log out');
  expect(logOut).toBeDefined();
  act(() => {
    logOut!.props.onPress();
  });
  expect(mockLogOut).toHaveBeenCalledTimes(1);
});
