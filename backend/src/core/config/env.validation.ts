/* eslint-disable unicorn/no-thenable */
import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test', 'staging').default('development'),
  PORT: Joi.number().default(3000),
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().default(5432),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_DB: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),

  // JWT
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRATION: Joi.string().required(),
  JWT_REFRESH_EXPIRATION: Joi.string().required(),
  
  // Twilio
  USE_MOCK_TWILIO: Joi.boolean().default(false),
  TWILIO_ACCOUNT_SID: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  TWILIO_AUTH_TOKEN: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  TWILIO_VERIFY_SERVICE_SID: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),

  // Razorpay
  RAZORPAY_KEY_ID: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  RAZORPAY_KEY_SECRET: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  RAZORPAY_WEBHOOK_SECRET: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),

  // Push / FCM
  PUSH_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('fcm').required(),
    otherwise: Joi.string().valid('fcm', 'mock').default('mock'),
  }),
  GOOGLE_APPLICATION_CREDENTIALS: Joi.when('PUSH_PROVIDER', {
    is: 'fcm',
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  FIREBASE_PROJECT_ID: Joi.string().optional().allow(''),

  // Location / Maps
  GOOGLE_MAPS_API_KEY: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),

  // Cloudinary
  CLOUDINARY_URL: Joi.when('NODE_ENV', {
    is: Joi.string().valid('production', 'staging'),
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),

  NEW_BUSINESS_DAYS: Joi.number().default(30),
});
