import { MoneyUtil } from './money.util.js';

describe('MoneyUtil', () => {
  describe('toMinorUnit', () => {
    it('should correctly convert a string representing rupees to minor unit (paise)', () => {
      expect(MoneyUtil.toMinorUnit('1.00')).toBe(100);
      expect(MoneyUtil.toMinorUnit('10.50')).toBe(1050);
      expect(MoneyUtil.toMinorUnit('999.99')).toBe(99999);
      expect(MoneyUtil.toMinorUnit('5')).toBe(500);
      expect(MoneyUtil.toMinorUnit('5.2')).toBe(520);
      expect(MoneyUtil.toMinorUnit('0')).toBe(0);
      expect(MoneyUtil.toMinorUnit('0.00')).toBe(0);
      expect(MoneyUtil.toMinorUnit('9999999.99')).toBe(999999999);
      expect(MoneyUtil.toMinorUnit('-10.50')).toBe(-1050);
    });

    it('should correctly convert a number representing rupees to minor unit (paise)', () => {
      expect(MoneyUtil.toMinorUnit(1.00)).toBe(100);
      expect(MoneyUtil.toMinorUnit(10.50)).toBe(1050);
      expect(MoneyUtil.toMinorUnit(999.99)).toBe(99999);
      expect(MoneyUtil.toMinorUnit(5)).toBe(500);
      expect(MoneyUtil.toMinorUnit(5.2)).toBe(520);
      expect(MoneyUtil.toMinorUnit(0)).toBe(0);
      expect(MoneyUtil.toMinorUnit(-10.50)).toBe(-1050);
    });

    it('should reject invalid formats', () => {
      expect(() => MoneyUtil.toMinorUnit('10.501')).toThrowError('Invalid monetary amount format');
      expect(() => MoneyUtil.toMinorUnit('10.5.5')).toThrowError('Invalid monetary amount format');
      expect(() => MoneyUtil.toMinorUnit('abc')).toThrowError('Invalid monetary amount format');
      expect(() => MoneyUtil.toMinorUnit('')).toThrowError('Invalid monetary amount format');
    });
  });

  describe('toDecimal', () => {
    it('should correctly convert a minor unit (paise) back to a decimal number', () => {
      expect(MoneyUtil.toDecimal(100)).toBe(1);
      expect(MoneyUtil.toDecimal(1050)).toBe(10.5);
      expect(MoneyUtil.toDecimal(99999)).toBe(999.99);
      expect(MoneyUtil.toDecimal(500)).toBe(5);
      expect(MoneyUtil.toDecimal(520)).toBe(5.2);
      expect(MoneyUtil.toDecimal(0)).toBe(0);
      expect(MoneyUtil.toDecimal(999999999)).toBe(9999999.99);
      expect(MoneyUtil.toDecimal(-1050)).toBe(-10.5);
    });
  });
});
