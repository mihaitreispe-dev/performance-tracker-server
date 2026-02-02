import { ApiProperty } from '@nestjs/swagger';
import { ApiError } from 'src/lib/errors/api-error';

/**
 * Error Response envelope. All error responses need to be wrapped by this.
 * */
export class ErrorResponse {
  constructor(error: ApiError) {
    this.error = error;
  }
  @ApiProperty()
  error: ApiError;
}
