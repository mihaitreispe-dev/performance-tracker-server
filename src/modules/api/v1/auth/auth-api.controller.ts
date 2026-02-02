import { Body, Controller, Delete, Get, HttpStatus, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { DisableJwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { AuthApiService } from './auth-api.service';
import { CreateTokensBody, CreateTokensQuery, RevokeTokensBody } from './request.dto';
import { AuthSessionResponse, AuthUserResponse } from './response.dto';

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
  @DisableJwtAuthGuard()
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
}
