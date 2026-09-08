export const PHONE_VERIFICATION_PROVIDER = 'PHONE_VERIFICATION_PROVIDER';

export interface PhoneVerificationProvider {
  /**
   * Sends an OTP verification code to the given phone number.
   * @param phoneNumber The normalized phone number (e.g., +1234567890)
   */
  sendVerification(phoneNumber: string): Promise<void>;

  /**
   * Checks the provided OTP code against the phone number.
   * @param phoneNumber The normalized phone number
   * @param code The OTP code provided by the user
   * @returns boolean indicating if the code is valid
   */
  checkVerification(phoneNumber: string, code: string): Promise<boolean>;
}
