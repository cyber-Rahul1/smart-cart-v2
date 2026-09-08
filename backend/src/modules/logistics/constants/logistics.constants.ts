export const DISPATCH_QUEUE = 'dispatch';
export const JOB_EXPIRE_OFFER = 'expire-offer';
export const JOB_DISPATCH_RETRY = 'dispatch-retry';

export const OUTBOX_QUEUE = 'outbox';
export const JOB_PROCESS_OUTBOX_EVENT = 'process-outbox-event';

export const DISPATCH_CONFIG = {
  SEARCH_RADIUS_METERS: process.env.DISPATCH_SEARCH_RADIUS_METERS ? parseInt(process.env.DISPATCH_SEARCH_RADIUS_METERS) : 5000,
  LOCATION_FRESHNESS_THRESHOLD_SEC: process.env.LOCATION_FRESHNESS_THRESHOLD_SEC ? parseInt(process.env.LOCATION_FRESHNESS_THRESHOLD_SEC) : 120,
  OFFER_EXPIRY_SEC: process.env.OFFER_EXPIRY_SEC ? parseInt(process.env.OFFER_EXPIRY_SEC) : 45,
  TOP_N_CANDIDATES: process.env.TOP_N_CANDIDATES ? parseInt(process.env.TOP_N_CANDIDATES) : 3,
  MAX_DISPATCH_ATTEMPTS: process.env.MAX_DISPATCH_ATTEMPTS ? parseInt(process.env.MAX_DISPATCH_ATTEMPTS) : 3,
};
