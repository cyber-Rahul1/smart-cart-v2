import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealMessage } from '../entities/meal-message.entity.js';

/**
 * Response shape for paginated message lists.
 *
 * The cursor string is opaque to the controller – its encoding/decoding is
 * owned entirely by CommunityMealMessagesService. The controller builds this
 * DTO from the raw MealMessage[] the service returns, computing nextCursor
 * from the last message's createdAt + id fields using the same base64-JSON
 * format that the service reads on the next request.
 */
export class PaginatedMessageDto {
  @ApiProperty({ description: 'Array of messages for this page', type: [MealMessage] })
  data: MealMessage[];

  @ApiProperty({ description: 'Pagination metadata' })
  meta: {
    limit: number;
    hasNext: boolean;
    nextCursor: string | null;
  };
}
