/**
 * AuthFlow routing after OTP verify (roles rename). Where a person lands
 * depends only on what the backend says about them:
 *
 *   - company role + company       -> straight into the app (their session)
 *   - no company AND no role       -> company setup (a brand-new person)
 *   - Fenzit staff                 -> no company screens, ever
 *   - anything inconsistent        -> the plain "no company" screen, NEVER
 *     company setup (setup would be a 403/409 at best, a stray company at worst)
 *
 * The step screens are mocked and driven through their props, like
 * AuthFlow.test.tsx.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../../services', () => ({
  authApi: {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
    setupCompany: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

jest.mock('./useAuth', () => ({
  useSessionExpired: jest.fn(() => false),
  clearSessionExpired: jest.fn(),
}));

jest.mock('./screens/PhoneScreen', () => ({ PhoneScreen: () => null }));
jest.mock('./screens/OtpScreen', () => ({ OtpScreen: () => null }));
jest.mock('./screens/ProfileScreen', () => ({ ProfileScreen: () => null }));

import AuthFlow, { routeAfterVerify } from './AuthFlow';
import { authApi } from '../../services';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { NO_COMPANY_MESSAGE } from './noAccessCopy';

const sendOtp = authApi.sendOtp as jest.Mock;
const verifyOtp = authApi.verifyOtp as jest.Mock;
const setupCompany = authApi.setupCompany as jest.Mock;

type WireUser = {
  tenantId: string | null;
  role: string | null;
  platformAdmin: boolean;
};

function user(over: Partial<WireUser>) {
  return { userId: 'u-1', name: 'Asha', tenantId: null, role: null, platformAdmin: false, ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  sendOtp.mockResolvedValue({ otp_session_id: 'sess-1' });
});

async function login(wireUser: ReturnType<typeof user>) {
  verifyOtp.mockResolvedValue({ token: 'token-1', user: wireUser });
  const onComplete = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<AuthFlow onComplete={onComplete} />);
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(PhoneScreen).props.onContinue();
  });
  const otp = renderer.root.findByType(OtpScreen);
  await ReactTestRenderer.act(async () => {
    otp.props.onChangeCode('1234');
  });
  await ReactTestRenderer.act(async () => {
    await otp.props.onVerify();
  });
  return { renderer, onComplete };
}

const onProfileStep = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(ProfileScreen).length > 0;

describe('a person who belongs to a company goes straight in', () => {
  it.each(['company_admin', 'employee', 'viewer'])('%s', async role => {
    const { renderer, onComplete } = await login(user({ role, tenantId: 't-9' }));

    expect(onProfileStep(renderer)).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      role,
      tenantId: 't-9',
      platformAdmin: false,
      name: 'Asha',
    });
  });
});

describe('a brand-new person (no company AND no role) is sent to company setup', () => {
  it('shows the setup step and does not complete the login yet', async () => {
    const { renderer, onComplete } = await login(user({}));

    expect(onProfileStep(renderer)).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('finishing setup makes them a company admin of the new company', async () => {
    setupCompany.mockResolvedValueOnce({ token: 'token-2', tenant: { id: 't-new' } });
    const { renderer, onComplete } = await login(user({}));
    const screen = renderer.root.findByType(ProfileScreen);
    await ReactTestRenderer.act(async () => {
      screen.props.onChange({
        ownerName: ' Asha Rao ',
        businessName: 'Rao Services',
        businessTypes: ['Plumbing service'],
        stateCode: 'KA',
      });
    });
    await ReactTestRenderer.act(async () => {
      await screen.props.onFinish();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      role: 'company_admin',
      tenantId: 't-new',
      platformAdmin: false,
      name: 'Asha Rao',
    });
  });

  it.each([
    [409, NO_COMPANY_MESSAGE],
    [403, "This account can't set up a company. Contact your company admin."],
  ])('a %i from company setup shows plain copy and stays on the step', async (status, message) => {
    setupCompany.mockRejectedValueOnce({ status, code: 'X', message: 'raw server text' });
    const { renderer, onComplete } = await login(user({}));
    const screen = renderer.root.findByType(ProfileScreen);
    await ReactTestRenderer.act(async () => {
      screen.props.onChange({ ownerName: 'Asha', businessName: 'B', businessTypes: ['x'], stateCode: 'KA' });
    });
    await ReactTestRenderer.act(async () => {
      await screen.props.onFinish();
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(renderer.root.findByType(ProfileScreen).props.serverError).toBe(message);
  });
});

describe('people who cannot open a company never reach company setup', () => {
  it.each([
    ['Fenzit staff (flag + role)', user({ role: 'platform_admin', platformAdmin: true }), true],
    ['Fenzit staff (flag only)', user({ platformAdmin: true }), true],
    ['Fenzit staff (role only)', user({ role: 'platform_admin' }), true],
    ['Fenzit staff with a company id', user({ role: 'platform_admin', platformAdmin: true, tenantId: 't-1' }), true],
    ['a company but no role', user({ tenantId: 't-1' }), false],
    ['a role but no company', user({ role: 'employee' }), false],
    ['an unknown role with a company', user({ role: 'owner', tenantId: 't-1' }), false],
  ])('%s', async (_name, wireUser, staff) => {
    const { renderer, onComplete } = await login(wireUser);

    expect(onProfileStep(renderer)).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      role: null,
      tenantId: null,
      platformAdmin: staff,
    });
  });
});

describe('routeAfterVerify', () => {
  it('a company role without a company id is treated as no access, not as that role', () => {
    expect(
      routeAfterVerify({ userId: 'u', name: null, role: 'company_admin', tenantId: null, platformAdmin: false, formerMember: false }),
    ).toEqual({ role: null, tenantId: null, platformAdmin: false });
  });

  it('the staff flag wins over everything else', () => {
    expect(
      routeAfterVerify({ userId: 'u', name: null, role: 'company_admin', tenantId: 't', platformAdmin: true, formerMember: false }),
    ).toEqual({ role: null, tenantId: null, platformAdmin: true });
  });
});
