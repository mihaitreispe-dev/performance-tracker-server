import { Body, Controller, HttpStatus, Post, Query, Req, UploadedFile, UseInterceptors, Version } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { GenerateResponseBody, GenerateResponseResponse } from './dto/generate-response.dto';
import { ParseIntentBody, ParseIntentResponse } from './dto/parse-intent.dto';
import { TranscribeQuery, TranscribeResponse } from './dto/transcribe.dto';
import { VoiceService } from './voice.service';

@ApiTags('voice')
@ApiBearerAuth('JWT')
@Controller('voice')
export class VoiceController {
  constructor(private readonly service: VoiceService) {}

  @Version('1')
  @ApiOperation({ summary: 'Transcribe audio to text using OpenAI Whisper' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: 'Audio file (webm, mp3, wav, m4a)',
        },
      },
      required: ['audio'],
    },
  })
  @ApiResponse({ status: HttpStatus.OK, type: TranscribeResponse })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponse,
    description: 'Invalid audio or transcription failed',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max (Whisper limit)
      },
      fileFilter: (_req, file, cb) => {
        const allowedMimes = [
          'audio/webm',
          'audio/mp3',
          'audio/mpeg',
          'audio/wav',
          'audio/x-wav',
          'audio/m4a',
          'audio/mp4',
          'audio/ogg',
          'audio/flac',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Invalid audio format: ${file.mimetype}`), false);
        }
      },
    }),
  )
  @Post('transcribe')
  async transcribeAudio(
    @Req() req: Request & { user: AuthUser },
    @UploadedFile() file: Express.Multer.File,
    @Query() query: TranscribeQuery,
  ): Promise<TranscribeResponse> {
    if (!file) {
      throw new Error('No audio file provided');
    }

    const transcription = await this.service.transcribeAudio(req, file.buffer, query.language);

    return { data: transcription };
  }

  @Version('1')
  @ApiOperation({ summary: 'Parse text to detect intent using GPT function calling' })
  @ApiResponse({ status: HttpStatus.OK, type: ParseIntentResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Intent parsing failed' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('parse-intent')
  async parseIntent(
    @Req() req: Request & { user: AuthUser },
    @Body() body: ParseIntentBody,
  ): Promise<ParseIntentResponse> {
    const intent = await this.service.parseIntent(req, body);

    return { data: intent };
  }

  @Version('1')
  @ApiOperation({ summary: 'Generate natural language response from API data' })
  @ApiResponse({ status: HttpStatus.OK, type: GenerateResponseResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Response generation failed' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('generate-response')
  async generateResponse(
    @Req() req: Request & { user: AuthUser },
    @Body() body: GenerateResponseBody,
  ): Promise<GenerateResponseResponse> {
    const response = await this.service.generateResponse(req, body);

    return { data: response };
  }
}
