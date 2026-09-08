import { envValidationSchema } from './env.validation.js';

describe('envValidationSchema', () => {
  const validBaseConfig = {
    POSTGRES_HOST: 'localhost',
    POSTGRES_USER: 'test',
    POSTGRES_PASSWORD: 'test',
    POSTGRES_DB: 'test',
    REDIS_HOST: 'localhost',
    JWT_SECRET: 'secret',
    JWT_EXPIRATION: '15m',
    JWT_REFRESH_EXPIRATION: '30d',
  };

  describe('production mode', () => {
    it('should fail if PUSH_PROVIDER is not fcm', () => {
      const config = {
        ...validBaseConfig,
        NODE_ENV: 'production',
        TWILIO_ACCOUNT_SID: 'sid',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_VERIFY_SERVICE_SID: 'vsid',
        RAZORPAY_KEY_ID: 'rid',
        RAZORPAY_KEY_SECRET: 'rsec',
        RAZORPAY_WEBHOOK_SECRET: 'rwsec',
        GOOGLE_MAPS_API_KEY: 'maps',
        CLOUDINARY_URL: 'cloudinary',
        // Missing PUSH_PROVIDER
      };

      const { error } = envValidationSchema.validate(config);
      expect(error).toBeDefined();
      expect(error!.message).toContain('"PUSH_PROVIDER" is required');
    });

    it('should fail if PUSH_PROVIDER is mock', () => {
      const config = {
        ...validBaseConfig,
        NODE_ENV: 'production',
        TWILIO_ACCOUNT_SID: 'sid',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_VERIFY_SERVICE_SID: 'vsid',
        RAZORPAY_KEY_ID: 'rid',
        RAZORPAY_KEY_SECRET: 'rsec',
        RAZORPAY_WEBHOOK_SECRET: 'rwsec',
        GOOGLE_MAPS_API_KEY: 'maps',
        CLOUDINARY_URL: 'cloudinary',
        PUSH_PROVIDER: 'mock', // Invalid in prod
      };

      const { error } = envValidationSchema.validate(config);
      expect(error).toBeDefined();
      expect(error!.message).toContain('"PUSH_PROVIDER" must be [fcm]');
    });

    it('should pass if PUSH_PROVIDER is fcm and credentials provided', () => {
      const config = {
        ...validBaseConfig,
        NODE_ENV: 'production',
        TWILIO_ACCOUNT_SID: 'sid',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_VERIFY_SERVICE_SID: 'vsid',
        RAZORPAY_KEY_ID: 'rid',
        RAZORPAY_KEY_SECRET: 'rsec',
        RAZORPAY_WEBHOOK_SECRET: 'rwsec',
        GOOGLE_MAPS_API_KEY: 'maps',
        CLOUDINARY_URL: 'cloudinary',
        PUSH_PROVIDER: 'fcm',
        GOOGLE_APPLICATION_CREDENTIALS: '/path/to/creds.json',
      };

      const { error } = envValidationSchema.validate(config);
      expect(error).toBeUndefined();
    });

    it('should fail if missing required provider credentials', () => {
      const config = {
        ...validBaseConfig,
        NODE_ENV: 'production',
        // Missing Twilio, Razorpay, etc.
        PUSH_PROVIDER: 'fcm',
        GOOGLE_APPLICATION_CREDENTIALS: '/path/to/creds.json',
      };

      const { error } = envValidationSchema.validate(config);
      expect(error).toBeDefined();
    });
  });

  describe('development/test mode', () => {
    it('should pass without remote provider credentials', () => {
      const config = {
        ...validBaseConfig,
        NODE_ENV: 'development',
      };

      const { error, value } = envValidationSchema.validate(config);
      expect(error).toBeUndefined();
      expect(value.PUSH_PROVIDER).toBe('mock');
      expect(value.USE_MOCK_TWILIO).toBe(false);
    });

    it('should correctly parse USE_MOCK_TWILIO as boolean', () => {
      const config = {
        ...validBaseConfig,
        NODE_ENV: 'development',
        USE_MOCK_TWILIO: 'true',
      };

      const { error, value } = envValidationSchema.validate(config);
      expect(error).toBeUndefined();
      expect(value.USE_MOCK_TWILIO).toBe(true); // Parsed properly by Joi
    });
  });

  describe('JWT validation', () => {
    it('should fail if JWT config is missing', () => {
      const config = {
        POSTGRES_HOST: 'localhost',
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'test',
        REDIS_HOST: 'localhost',
      };

      const { error } = envValidationSchema.validate(config);
      expect(error).toBeDefined();
      expect(error!.message).toContain('"JWT_SECRET" is required');
    });
  });
});
