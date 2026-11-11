/**
 * Turns a phone-book number into the 10-digit mobile number the invite form
 * expects. Phone books store numbers in many shapes ("+91 98765 43210",
 * "098765-43210", "(0) 98765 43210"), so everything except digits is dropped
 * first. A country code of 91 (12 digits) or a trunk 0 (11 digits) is then
 * removed. Anything that is not exactly PHONE_LENGTH digits is rejected.
 */
import { PHONE_LENGTH } from './constants';

export function toLocalMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === PHONE_LENGTH + 2 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === PHONE_LENGTH + 1 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.length === PHONE_LENGTH ? digits : null;
}
