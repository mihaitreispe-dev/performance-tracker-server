import { Body, Controller, Delete, Get, HttpStatus, Patch, Post, Query, Req, UseGuards, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { RateLimit, RateLimitGuard, RateLimitPresets } from 'src/lib/guards/rate-limit.guard';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { DisableJwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { AuthApiService } from './auth-api.service';
import {
  CreateTokensBody,
  CreateTokensQuery,
  RevokeTokensBody,
  UpdateUserBody,
  UpdateUserSettingsBody,
} from './request.dto';
import { AuthSessionResponse, AuthUserResponse, PictureUploadUrlResponse, UserSettingsResponse } from './response.dto';

@ApiTags('auth')
@ApiBearerAuth('JWT')
@Controller('auth')
export class AuthApiController {
  constructor(private readonly service: AuthApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Create tokens' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: AuthSessionResponse,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, type: ErrorResponse, description: 'Rate limit exceeded' })
  @DisableJwtAuthGuard()
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitPresets.LOGIN)
  @Post('tokens')
  async createTokens(
    @Req() req: Request,
    @Query() reqQuery: CreateTokensQuery,
    @Body() reqBody: CreateTokensBody,
  ): Promise<AuthSessionResponse> {
    return this.service.createTokens(req, reqQuery, reqBody);
  }

  @Version('1')
  @ApiOperation({ summary: 'Revoke tokens' })
  @ApiResponse({
    status: HttpStatus.CREATED,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Delete('tokens')
  async revokeTokens(@Req() req: Request & { user: AuthUser }, @Body() reqBody: RevokeTokensBody): Promise<void> {
    return this.service.revokeTokens(req, reqBody);
  }

  @Version('1')
  @ApiOperation({ summary: 'Returns the authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: AuthUserResponse,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('user')
  async getUser(@Req() req: Request & { user: AuthUser }): Promise<AuthUserResponse> {
    return this.service.getUser(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update the authenticated user' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: AuthUserResponse,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch('user')
  async updateUser(@Req() req: Request & { user: AuthUser }, @Body() body: UpdateUserBody): Promise<AuthUserResponse> {
    return this.service.updateUser(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get a presigned URL for uploading a profile picture' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PictureUploadUrlResponse,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('user/picture-upload-url')
  async getUploadPictureUrl(@Req() req: Request & { user: AuthUser }): Promise<PictureUploadUrlResponse> {
    return this.service.getUploadPictureUrl(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get user settings' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserSettingsResponse,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('user/settings')
  async getUserSettings(@Req() req: Request & { user: AuthUser }): Promise<UserSettingsResponse> {
    return this.service.getUserSettings(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update user settings' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: UserSettingsResponse,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch('user/settings')
  async updateUserSettings(
    @Req() req: Request & { user: AuthUser },
    @Body() body: UpdateUserSettingsBody,
  ): Promise<UserSettingsResponse> {
    return this.service.updateUserSettings(req, body);
  }
}
