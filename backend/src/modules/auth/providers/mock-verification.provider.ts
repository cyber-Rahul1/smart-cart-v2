import { Injectable, Logger } from '@nestjs/common';
import { PhoneVerificationProvider } from './phone-verification.provider.js';

@Injectable()
export class MockVerificationProvider implements PhoneVerificationProvider {
  private readonly logger = new Logger(MockVerificationProvider.name);

  // In-memory store for development (phone -> code).
  // Note: For a real distributed dev environment, this would use Redis.
  private store = new Map<string, string>();

  async sendVerification(phoneNumber: string): Promise<void> {
    // Fixed code for deterministic testing, or random for somewhat realistic testing
    const code = '123456'; 
    this.store.set(phoneNumber, code);
    this.logger.log(`[MOCK] Twilio OTP requested for ${phoneNumber}. Use code: ${code}`);
  }

  async checkVerification(phoneNumber: string, code: string): Promise<boolean> {
    const storedCode = this.store.get(phoneNumber);
    if (!storedCode) {
      return false;
    }
    
    if (storedCode === code) {
      this.store.delete(phoneNumber);
      return true;
    }
    
    return false;
  }
}
