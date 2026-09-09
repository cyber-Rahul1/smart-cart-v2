import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { PaymentMethod } from '../../payments/enums/payment-method.enum.js';

export class InitiateAllocationPaymentDto {
  @IsString()
  @IsNotEmpty()
  addressId: string;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;
}