import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { PhoneVerificationProvider } from './phone-verification.provider.js';
import { ProviderException, ProviderErrorType } from '../../../core/exceptions/provider.exception.js';

@Injectable()
export class TwilioVerificationProvider implements PhoneVerificationProvider {
  private readonly logger = new Logger(TwilioVerificationProvider.name);
  private readonly client: twilio.Twilio;
  private readonly serviceSid: string;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.serviceSid = this.configService.get<string>('TWILIO_VERIFY_SERVICE_SID')!;

    if (!accountSid || !authToken || !this.serviceSid) {
      throw new Error('Twilio credentials are not fully configured in the environment.');
    }

    this.client = twilio(accountSid, authToken);
  }

  async sendVerification(phoneNumber: string): Promise<void> {
    try {
      await this.client.verify.v2
        .services(this.serviceSid)
        .verifications.create({ to: phoneNumber, channel: 'sms' });
      this.logger.log(`Twilio OTP sent to ${phoneNumber}`);
    } catch (error: any) {
      this.logger.error(`Failed to send Twilio OTP to ${phoneNumber}: ${error.message}`, error.stack);
      
      let errorType = ProviderErrorType.UNKNOWN;
      if (error.code === 20429 || error.status === 429) errorType = ProviderErrorType.TEMPORARY_OUTAGE;
      else if (error.status === 400) errorType = ProviderErrorType.VALIDATION_FAILURE;
      else if (error.status === 401 || error.status === 403) errorType = ProviderErrorType.AUTH_FAILURE;

      throw new ProviderException('Twilio', errorType, 'Failed to send verification code.', error);
    }
  }

  async checkVerification(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const verificationCheck = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks.create({ to: phoneNumber, code });
        
      if (verificationCheck.status === 'approved') {
        return true;
      }
      return false;
    } catch (error: any) {
      if (error.status === 404) {
        // Verification record not found or expired
        return false;
      }
      this.logger.error(`Failed to check Twilio OTP for ${phoneNumber}: ${error.message}`, error.stack);
      
      let errorType = ProviderErrorType.UNKNOWN;
      if (error.status === 429) errorType = ProviderErrorType.TEMPORARY_OUTAGE;
      else if (error.status === 401 || error.status === 403) errorType = ProviderErrorType.AUTH_FAILURE;

      throw new ProviderException('Twilio', errorType, 'An error occurred while verifying the code.', error);
    }
  }
}
