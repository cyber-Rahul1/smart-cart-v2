import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckoutPreviewRequestDto {
  @ApiProperty({ description: 'The UUID of the selected delivery address' })
  @IsUUID()
  @IsNotEmpty()
  addressId: string;
}

export class CheckoutQuoteDto {
  @ApiProperty()
  quoteId: string;

  @ApiProperty()
  generatedAt: Date;

  @ApiProperty()
  cartId: string;

  @ApiProperty()
  shop: {
    id: string;
    name: string;
    minimumOrder: number;
    deliveryRadius: number;
  };

  @ApiProperty()
  address: {
    id: string;
    label: string;
    distanceMeters: number;
  };

  @ApiProperty()
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    isAvailable: boolean;
  }>;

  @ApiProperty()
  subtotal: number;

  @ApiProperty()
  minimumOrderSatisfied: boolean;

  @ApiProperty()
  deliveryEligible: boolean;

  @ApiProperty()
  validationErrors?: Array<{
    code: string;
    message: string;
    details?: any;
  }>;
}
