import { IsUUID, IsInt, Min, Max } from 'class-validator';

// Business constant for max cart item quantity
export const MAX_CART_QUANTITY = 99;

export class AddToCartDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(MAX_CART_QUANTITY)
  quantity: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  @Max(MAX_CART_QUANTITY)
  quantity: number;
}
