import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { GrantType } from './types';

export class CreateTokensQuery {
  @ApiProperty({
    enum: GrantType,
    example: GrantType.firebase,
  })
  @IsEnumString(GrantType)
  grantType: GrantType;
}

export class CreateTokensBody {
  @ApiPropertyOptional({ type: String, description: 'Firebase idToken when grantType = firebase' })
  @IsString()
  @IsOptional()
  idToken?: string;

  @ApiPropertyOptional({ type: String, description: 'Firebase FCM device token when grantType = firebase' })
  @IsString()
  @IsOptional()
  fcmToken?: string;

  @ApiPropertyOptional({ type: String, description: 'refreshToken when grantType = refreshToken' })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({ type: String, description: 'Firebase display name' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ type: String, description: 'Jury creator code for assessment client registration' })
  @IsString()
  @IsOptional()
  juryCreatorCode?: string;
}

export class UpdateUserBody {
  @ApiPropertyOptional({ type: String, description: 'First name' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ type: String, description: 'Last name' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ type: String, description: 'S3 key for uploaded profile picture' })
  @IsString()
  @IsOptional()
  pictureS3Key?: string;
}

export class RevokeTokensBody {
  @ApiProperty({ description: 'refreshToken' })
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({ type: String, description: 'Firebase FCM device token to unregister on logout' })
  @IsString()
  @IsOptional()
  fcmToken?: string;
}
