/**
 * The employee card's Resend rules (story 21-4), as the owner sees them.
 *
 *   - Resend is for an invited person who has not joined yet. A joined person
 *     who is offline must not get it (the server would refuse with 409).
 *   - Resend is for company admins only. Employees and viewers never see it.
 *   - Once the person is active, Resend is hidden.
 *   - A cap stop (refused_cap) or a disabled SMS (not_configured) hides the
 *     button and shows the reason instead.
 *   - The phone shows masked; the full number is never on screen.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { TechnicianRow, maskPhoneForDisplay } from './TechnicianRow';
import type { InviteSmsStatus, Technician } from '../types';
import { INVITE_SMS_CAP_COPY } from '../inviteSms';

const INVITED: Technician = {
  id: 'invite_abc123',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phone: '9111111111',
  status: 'offline',
  isInvited: true,
  invitedAt: '2026-11-11T00:00:00Z',
  skillIds: [],
};

const ACTIVE: Technician = { ...INVITED, id: 'user-2', status: 'active', isInvited: false };
const JOINED_OFFLINE: Technician = { ...INVITED, id: 'user-3', isInvited: false };

function render(technician: Technician, canResend: boolean) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<TechnicianRow technician={technician} canResend={canResend} />);
  });
  return renderer;
}

function withStatus(smsStatus: InviteSmsStatus | null): Technician {
  return { ...INVITED, smsStatus };
}

function hasResendButton(renderer: ReactTestRenderer.ReactTestRenderer): boolean {
  return renderer.root.findAll(
    n => n.props.accessibilityLabel === 'Resend SMS' && typeof n.props.onPress === 'function',
  ).length > 0;
}

/** Every string the card renders, joined, so a test can look for copy. */
function visibleText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  const strings: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance) => {
    node.children.forEach(child => {
      if (typeof child === 'string') strings.push(child);
      else walk(child as ReactTestRenderer.ReactTestInstance);
    });
  };
  walk(renderer.root);
  return strings.join(' | ');
}

describe('employee card: who sees Resend', () => {
  it('admin, invited, SMS failed: Resend is shown', () => {
    expect(hasResendButton(render(withStatus('failed'), true))).toBe(true);
  });

  it('admin, invited, SMS sent: Resend is still shown, so a text that never arrived can be sent again', () => {
    expect(hasResendButton(render(withStatus('sent'), true))).toBe(true);
  });

  it('admin, invited from the roster (no session status): Resend is shown', () => {
    expect(hasResendButton(render(withStatus(null), true))).toBe(true);
  });

  it('admin, invited, cap reached: no button, and the cap reason is shown', () => {
    const renderer = render(withStatus('refused_cap'), true);
    expect(hasResendButton(renderer)).toBe(false);
    expect(visibleText(renderer)).toContain(INVITE_SMS_CAP_COPY);
  });

  it('admin, invited, SMS not switched on: no button, and the plain line is shown', () => {
    const renderer = render(withStatus('not_configured'), true);
    expect(hasResendButton(renderer)).toBe(false);
    expect(visibleText(renderer)).toContain('SMS sending is not switched on yet.');
  });

  it('admin, active employee: no Resend, whatever the old SMS status', () => {
    expect(hasResendButton(render({ ...ACTIVE, smsStatus: 'failed' }, true))).toBe(false);
  });

  it('admin, offline but already joined: no Resend (the server would refuse it)', () => {
    expect(hasResendButton(render({ ...JOINED_OFFLINE, smsStatus: 'failed' }, true))).toBe(false);
  });

  it('employee or viewer (not admin): no Resend and no SMS status line', () => {
    const renderer = render(withStatus('failed'), false);
    expect(hasResendButton(renderer)).toBe(false);
    expect(visibleText(renderer)).not.toContain('SMS not sent');
  });
});

describe('employee card: phone is masked', () => {
  it('shows only the dial code and the last four digits', () => {
    const text = visibleText(render(INVITED, false));
    expect(text).toContain('+91 ******1111');
    expect(text).not.toContain('9111111111');
  });
});

describe('maskPhoneForDisplay', () => {
  it.each([
    ['9876543210', '+91 ******3210'],
    ['98765 43210', '+91 ******3210'],
    ['0987654321', '+91 ******4321'],
  ])('masks %s to %s', (phone, expected) => {
    expect(maskPhoneForDisplay(phone, '+91')).toBe(expected);
  });

  it('a short number is never longer than the digits it has', () => {
    expect(maskPhoneForDisplay('123', '+91')).toBe('+91 123');
  });

  it('a 4-digit number is shown in full, with no stars', () => {
    expect(maskPhoneForDisplay('1234', '+91')).toBe('+91 1234');
  });
});
