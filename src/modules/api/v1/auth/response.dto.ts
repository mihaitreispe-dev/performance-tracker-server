import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUrl, IsUUID, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';
import { TokenType } from 'src/modules/auth/types/token-type';

class AuthUserDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  firstName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  lastName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsUrl()
  @IsOptional()
  picture?: string | null;
}

class AuthSessionDTO {
  @ApiProperty()
  @IsString()
  accessToken: string;

  @ApiPropertyOptional({ type: Number })
  @IsString()
  @IsOptional()
  accessTokenExpiresIn?: number;

  @ApiProperty()
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({ type: Number })
  @IsString()
  @IsOptional()
  refreshTokenExpiresIn?: number | null;

  @ApiProperty({ enum: TokenType, example: TokenType.bearer })
  @IsEnumString(TokenType)
  tokenType: TokenType;

  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  user: AuthUserDTO;
}
export class AuthSessionResponse extends ItemResponse<AuthSessionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AuthSessionDTO;
}

export class AuthUserResponse extends ItemResponse<AuthUserDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AuthUserDTO;
}
