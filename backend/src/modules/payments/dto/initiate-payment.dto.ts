import { IsEnum, IsNotEmpty } from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum.js';

export class InitiatePaymentDto {
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;
}
