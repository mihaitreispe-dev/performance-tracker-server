import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpServer,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ErrorHttpStatusCode } from '@nestjs/common/utils/http-error-by-code.util';
import { AbstractHttpAdapter, HttpAdapterHost } from '@nestjs/core';
import { isObject } from 'lodash';
import { EntityNotFoundError } from 'src/lib/errors/entity.errors';

import { HttpErrorCodeStringByStatusCode, HttpErrorMessageByStatusCode } from './error-mapping';
/**
 * Maps all errors in ErrorResponseEnvelope
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private static readonly logger = new Logger(AllExceptionsFilter.name);
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: any, host: ArgumentsHost) {
    const applicationRef = this.httpAdapterHost && this.httpAdapterHost.httpAdapter;

    let httpException: HttpException;
    if (exception instanceof HttpException) {
      httpException = exception;
    } else {
      if (exception instanceof EntityNotFoundError) {
        httpException = new NotFoundException(exception);
      } else {
        return this.handleUnknownError(exception, host, applicationRef);
      }
    }

    const res = httpException.getResponse();
    const message = isObject(res)
      ? this.isHttpError(res)
        ? { code: HttpErrorCodeStringByStatusCode[res.statusCode as ErrorHttpStatusCode], message: res.message }
        : res
      : {
          code: HttpErrorCodeStringByStatusCode[httpException.getStatus() as ErrorHttpStatusCode],
          message: res,
        };

    applicationRef.reply(host.getArgByIndex(1), { error: message }, httpException.getStatus());
  }

  private handleUnknownError(exception: any, host: ArgumentsHost, applicationRef: AbstractHttpAdapter | HttpServer) {
    let statusCode: HttpStatus;
    let message: string;
    if (this.isHttpError(exception)) {
      statusCode = exception.statusCode as ErrorHttpStatusCode;
      message = exception.message;
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = HttpErrorMessageByStatusCode[HttpStatus.INTERNAL_SERVER_ERROR];
    }
    const code = HttpErrorCodeStringByStatusCode[statusCode];
    applicationRef.reply(host.getArgByIndex(1), { error: { code, message } }, statusCode);
  }

  /**
   * Checks if the thrown error comes from the "http-errors" library.
   * @param err error object
   */
  private isHttpError(err: any): err is { statusCode: number; message: string } {
    return Number.isSafeInteger(err?.statusCode) && typeof err?.message === 'string';
  }
}
