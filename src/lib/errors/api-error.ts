import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDetails {
  @ApiProperty()
  code: string;
  @ApiProperty()
  message: string;
  @ApiPropertyOptional({ type: String })
  target?: string;
}

export class ApiError {
  constructor(code: string, message: string, extra?: { target?: string; details?: ApiErrorDetails[] }) {
    this.code = code;
    this.message = message;
    this.target = extra?.target;
    this.details = extra?.details;
  }
  @ApiProperty()
  code: string;
  @ApiProperty()
  message: string;
  @ApiPropertyOptional({ type: String })
  target?: string;
  @ApiPropertyOptional({ isArray: true, type: ApiErrorDetails })
  details?: ApiErrorDetails[];
}
