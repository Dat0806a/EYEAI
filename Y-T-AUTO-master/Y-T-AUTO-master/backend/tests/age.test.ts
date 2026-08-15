import { calculateAge } from '../src/utils/age';

describe('calculateAge', () => {
  it('returns correct age for a past birthday', () => {
    expect(calculateAge('1990-05-15', new Date('2026-08-07'))).toBe(36);
  });

  it('does not count the next year before the birthday', () => {
    expect(calculateAge('1990-10-15', new Date('2026-08-07'))).toBe(35);
  });

  it('counts the birthday on the exact day', () => {
    expect(calculateAge('1990-08-07', new Date('2026-08-07'))).toBe(36);
  });

  it('returns 0 for today-born users', () => {
    expect(calculateAge('2026-08-07', new Date('2026-08-07'))).toBe(0);
  });

  it('throws on invalid dates', () => {
    expect(() => calculateAge('not-a-date')).toThrow('Invalid date of birth');
  });
});
