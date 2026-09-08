import { HttpException, HttpStatus } from '@nestjs/common';

export enum ProviderErrorType {
  TIMEOUT = 'TIMEOUT',
  AUTH_FAILURE = 'AUTH_FAILURE',
  VALIDATION_FAILURE = 'VALIDATION_FAILURE',
  TEMPORARY_OUTAGE = 'TEMPORARY_OUTAGE',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  ALREADY_PROCESSED = 'ALREADY_PROCESSED',
  UNKNOWN = 'UNKNOWN',
}

export class ProviderException extends HttpException {
  constructor(
    public readonly providerName: string,
    public readonly errorType: ProviderErrorType,
    message: string,
    public readonly originalError?: any,
  ) {
    // Map provider error type to HTTP status for the client
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientMessage = 'An unexpected error occurred with a third-party service.';
    
    switch (errorType) {
      case ProviderErrorType.TIMEOUT:
      case ProviderErrorType.TEMPORARY_OUTAGE:
        status = HttpStatus.SERVICE_UNAVAILABLE;
        clientMessage = 'Service is temporarily unavailable. Please try again later.';
        break;
      case ProviderErrorType.VALIDATION_FAILURE:
        status = HttpStatus.BAD_REQUEST;
        clientMessage = message; // Safe to show validation message
        break;
      case ProviderErrorType.DUPLICATE_REQUEST:
      case ProviderErrorType.ALREADY_PROCESSED:
        status = HttpStatus.CONFLICT;
        clientMessage = 'This request has already been processed.';
        break;
      case ProviderErrorType.AUTH_FAILURE:
        // Never expose provider auth failure to client
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        clientMessage = 'Service configuration error.';
        break;
    }

    super(clientMessage, status);
  }
}
