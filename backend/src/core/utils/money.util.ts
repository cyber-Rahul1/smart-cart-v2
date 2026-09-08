export class MoneyUtil {
  /**
   * Converts a decimal monetary amount (e.g., numeric(14,2) string from DB)
   * into an exact integer minor unit (e.g., cents or paise) to avoid floating point math errors.
   */
  static toMinorUnit(amount: string | number): number {
    const amountStr = typeof amount === 'number' ? amount.toFixed(2) : amount.toString();
    
    // Check if the amount is a valid number format
    if (!/^-?\d+(\.\d{1,2})?$/.test(amountStr)) {
      throw new Error(`Invalid monetary amount format: ${amountStr}`);
    }

    const [integerPart, decimalPart = '00'] = amountStr.split('.');
    
    // Pad decimal part with zeros if needed (e.g., "1" -> "10", "5" -> "50")
    const paddedDecimal = decimalPart.padEnd(2, '0');
    
    const combinedStr = integerPart + paddedDecimal;
    const minorUnit = parseInt(combinedStr, 10);

    if (isNaN(minorUnit)) {
      throw new Error(`Failed to convert amount to minor unit: ${amountStr}`);
    }

    return minorUnit;
  }

  /**
   * Converts an exact integer minor unit (e.g., cents or paise)
   * back to a decimal number (2 decimal places) for API responses.
   */
  static toDecimal(minorUnit: number): number {
    return minorUnit / 100;
  }
}
