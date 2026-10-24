/**
 * AuthFlow routing after OTP verify (roles rename + the intent picker from
 * the login redesign). Where a person lands depends on what the backend says
 * about them — and, for a brand-new number only, on what they SAID they are:
 *
 *   - company role + company       -> straight into the app (their session)
 *   - no company AND no role       -> company setup (a brand-new person)…
 *   -   …unless they picked staff  -> the not-on-team screen instead (never
 *     an owner company they never asked for)
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
  isReturningUser: jest.fn(() => false),
}));

jest.mock('./screens/PhoneScreen', () => ({ PhoneScreen: () => null }));
jest.mock('./screens/OtpScreen', () => ({ OtpScreen: () => null }));
jest.mock('./screens/ProfileScreen', () => ({ ProfileScreen: () => null }));
jest.mock('./screens/NotOnTeamScreen', () => ({ NotOnTeamScreen: () => null }));

import AuthFlow, { routeAfterVerify } from './AuthFlow';
import { authApi } from '../../services';
import { isReturningUser } from './useAuth';
import { PhoneScreen } from './screens/PhoneScreen';
import { OtpScreen } from './screens/OtpScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { NotOnTeamScreen } from './screens/NotOnTeamScreen';
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
  (isReturningUser as jest.Mock).mockReturnValue(false);
  sendOtp.mockResolvedValue({ otp_session_id: 'sess-1' });
});

async function login(
  wireUser: ReturnType<typeof user>,
  intent: 'owner' | 'staff' | null = null,
) {
  verifyOtp.mockResolvedValue({ token: 'token-1', user: wireUser });
  const onComplete = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<AuthFlow onComplete={onComplete} intent={intent} />);
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(PhoneScreen).props.onChangePhone('9876543210');
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
    [403, 'This account cannot set up a company. Please talk to your company owner.'],
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

describe('the intent answer routes a brand-new number (login redesign)', () => {
  it('staff intent + no team → the not-on-team screen, never company setup', async () => {
    const { renderer, onComplete } = await login(user({}), 'staff');

    expect(renderer.root.findAllByType(NotOnTeamScreen)).toHaveLength(1);
    expect(onProfileStep(renderer)).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('the not-on-team screen carries the entered number and wires both escapes', async () => {
    const { renderer } = await login(user({}), 'staff');
    const screen = renderer.root.findByType(NotOnTeamScreen);
    expect(screen.props.phone).toBe('9876543210');

    // The owner escape: straight into company setup.
    await ReactTestRenderer.act(async () => {
      screen.props.onSetUpInstead();
    });
    expect(onProfileStep(renderer)).toBe(true);
  });

  it('"use another number" goes back to step 1, not to company setup', async () => {
    const { renderer } = await login(user({}), 'staff');
    const screen = renderer.root.findByType(NotOnTeamScreen);

    await ReactTestRenderer.act(async () => {
      screen.props.onUseAnotherNumber();
    });

    expect(renderer.root.findAllByType(PhoneScreen)).toHaveLength(1);
    expect(onProfileStep(renderer)).toBe(false);
  });

  it('owner intent + no team goes straight to company setup — never not-on-team', async () => {
    const { renderer, onComplete } = await login(user({}), 'owner');

    expect(renderer.root.findAllByType(NotOnTeamScreen)).toHaveLength(0);
    expect(onProfileStep(renderer)).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('a skipped picker behaves like owner — company setup', async () => {
    const { renderer } = await login(user({}), null);

    expect(renderer.root.findAllByType(NotOnTeamScreen)).toHaveLength(0);
    expect(onProfileStep(renderer)).toBe(true);
  });

  it('the intent answer cannot touch someone who HAS a company — straight in', async () => {
    const { renderer, onComplete } = await login(
      user({ role: 'employee', tenantId: 't-9' }),
      'staff',
    );

    expect(onProfileStep(renderer)).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ role: 'employee', tenantId: 't-9' });
  });
});

describe('the failure copy on the highest-friction steps (review finding)', () => {
  async function renderAtPhone() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<AuthFlow onComplete={jest.fn()} />);
    });
    return renderer;
  }

  async function renderAtOtp() {
    const renderer = await renderAtPhone();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(PhoneScreen).props.onChangePhone('9876543210');
      await renderer.root.findByType(PhoneScreen).props.onContinue();
    });
    return renderer;
  }

  it.each([
    ['VALIDATION_ERROR', 'That mobile number doesn\u2019t look right.'],
    ['RATE_LIMIT_EXCEEDED', 'Too many attempts. Please wait a few minutes and try again.'],
    ['OTP_SEND_FAILED', 'Couldn\u2019t send the code. Please try again.'],
  ])('sendOtp %s surfaces its plain-English line on the phone step', async (code, message) => {
    sendOtp.mockRejectedValueOnce({ code });
    const renderer = await renderAtOtp();

    expect(renderer.root.findByType(PhoneScreen).props.serverError).toBe(message);
  });

  it('a wrong code tells the person simply and clears the entry', async () => {
    verifyOtp.mockRejectedValueOnce({ code: 'INVALID_OTP' });
    const renderer = await renderAtOtp();
    const otp = renderer.root.findByType(OtpScreen);
    await ReactTestRenderer.act(async () => {
      otp.props.onChangeCode('1234');
    });
    await ReactTestRenderer.act(async () => {
      await otp.props.onVerify();
    });

    expect(renderer.root.findByType(OtpScreen).props.error).toBe('Wrong code. Try again.');
  });

  it.each([
    ['OTP_EXPIRED', 'That code has expired. Please ask for a new one.'],
    ['OTP_SESSION_LOCKED', 'Too many wrong codes. Please ask for a new one.'],
  ])('%s sends the person back to step 1 with the recovery line', async (code, message) => {
    verifyOtp.mockRejectedValueOnce({ code });
    const renderer = await renderAtOtp();
    const otp = renderer.root.findByType(OtpScreen);
    await ReactTestRenderer.act(async () => {
      otp.props.onChangeCode('1234');
    });
    await ReactTestRenderer.act(async () => {
      await otp.props.onVerify();
    });

    expect(renderer.root.findByType(PhoneScreen).props.serverError).toBe(message);
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

  it('staff intent + a fresh number → notOnTeam', () => {
    expect(
      routeAfterVerify({ userId: 'u', name: null, role: null, tenantId: null, platformAdmin: false, formerMember: false }, 'staff'),
    ).toBe('notOnTeam');
  });

  it('owner intent and no intent → setup (the pre-intent default)', () => {
    for (const intent of ['owner', null] as const) {
      expect(
        routeAfterVerify({ userId: 'u', name: null, role: null, tenantId: null, platformAdmin: false, formerMember: false }, intent),
      ).toBe('setup');
    }
  });

  it('a removed person never lands on notOnTeam, whatever they picked — the plain message', () => {
    expect(
      routeAfterVerify({ userId: 'u', name: null, role: null, tenantId: null, platformAdmin: false, formerMember: true }, 'staff'),
    ).toEqual({ role: null, tenantId: null, platformAdmin: false });
  });
});

describe('the returning-device flag reaches the Login screen', () => {
  /** Renders just step 1 — the greeting lives only there. */
  async function renderPhoneStep() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<AuthFlow onComplete={jest.fn()} />);
    });
    return renderer;
  }

  it('a returning device greets with Welcome back', async () => {
    (isReturningUser as jest.Mock).mockReturnValueOnce(true);
    const renderer = await renderPhoneStep();

    expect(renderer.root.findByType(PhoneScreen).props.returningUser).toBe(true);
  });

  it('a fresh device gets the neutral greeting', async () => {
    const renderer = await renderPhoneStep();

    expect(renderer.root.findByType(PhoneScreen).props.returningUser).toBe(false);
  });
});
