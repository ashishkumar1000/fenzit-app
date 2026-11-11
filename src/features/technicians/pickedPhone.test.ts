import { toLocalMobile } from './pickedPhone';

describe('toLocalMobile', () => {
  it.each([
    ['+91 98765 43210', '9876543210'],
    ['098765-43210', '9876543210'],
    ['(0) 98765 43210', '9876543210'],
    ['9876543210', '9876543210'],
    ['919876543210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
  ])('cleans %j to %j', (raw, expected) => {
    expect(toLocalMobile(raw)).toBe(expected);
  });

  it('keeps a 10-digit number that merely starts with 91 (it is not a country code)', () => {
    expect(toLocalMobile('9198765432')).toBe('9198765432');
  });

  it('keeps a 10-digit number that starts with 0 (only an 11-digit 0 prefix is dropped)', () => {
    expect(toLocalMobile('0987654321')).toBe('0987654321');
  });

  it.each([
    ['98765', 'too short'],
    ['+91 98765 4321', 'nine digits after the country code'],
    ['+1 415 555 0100', 'a US number (11 digits, not 0-prefixed)'],
    ['0091 98765 43210', 'an international prefix leaves 14 digits'],
    ['98765 43210 99', 'twelve digits without the 91 prefix'],
    ['', 'empty'],
    ['+91', 'a country code with no subscriber digits'],
    ['abc', 'letters only'],
  ])('rejects %j (%s)', (raw) => {
    expect(toLocalMobile(raw)).toBeNull();
  });
});
