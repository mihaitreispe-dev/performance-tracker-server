import { randomUUID } from 'node:crypto';

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ErrorHttpStatusCode } from '@nestjs/common/utils/http-error-by-code.util';
import { Request, Response } from 'express';
import * as _ from 'lodash';
import { isObject } from 'lodash';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EntityNotFoundError } from 'src/lib/errors/entity.errors';
import { HttpErrorCodeStringByStatusCode } from 'src/lib/http/filters/error-mapping';

/**
 * Interceptor that logs input/output requests
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: Logger = new Logger('HTTP');

  /**
   * Intercept method, logs before and after the request being processed
   * @param context details about the current request
   * @param call$ implements the handle method that returns an Observable
   */
  public intercept(context: ExecutionContext, call$: CallHandler): Observable<unknown> {
    const startTime = Date.now();
    const reqId = randomUUID();
    this.logStart(context, reqId);
    return call$.handle().pipe(
      tap({
        next: (responseBody: unknown): void => {
          const endTime = Date.now();
          this.logNext(context, reqId, endTime - startTime, responseBody);
        },
        error: (err: Error): void => {
          const endTime = Date.now();
          this.logError(context, reqId, endTime - startTime, err);
        },
      }),
    );
  }

  /**
   * Logs the incoming request call
   */
  private logStart(context: ExecutionContext, reqId: string): void {
    const req: Request = context.switchToHttp().getRequest();
    const { method, url, body } = req;
    const message = `${method} ${url} reqId=${reqId}`;
    const sensitiveData = ['/auth/signin', '/auth/signup'].includes(url);
    this.logger.debug(
      `${message} req=${JSON.stringify({
        // headers: req.headers,
        body: sensitiveData ? '****' : body,
      })}`,
    );
  }

  /**
   * Logs the request response in success cases
   */
  private logNext(
    context: ExecutionContext,
    reqId: string,
    reqDuration: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    responseBody: unknown,
  ): void {
    const req: Request = context.switchToHttp().getRequest<Request>();
    const res: Response = context.switchToHttp().getResponse<Response>();
    const { method, url } = req;
    const { statusCode } = res;
    const message = `${method} ${url} status=${statusCode} took=${reqDuration} reqId=${reqId}`;
    this.logger.log(message);
  }

  /**
   * Logs the request response in error cases
   */
  private logError(context: ExecutionContext, reqId: string, reqDuration: number, error: Error): void {
    const req: Request = context.switchToHttp().getRequest<Request>();
    const { method, url, body } = req;

    if (error instanceof HttpException) {
      const statusCode: number = error.getStatus();
      const message = `${method} ${url} status=${statusCode} took=${reqDuration} reqId=${reqId}`;
      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `${message} info=${JSON.stringify({
            body,
            error: this.mapExceptionFormat(error),
          })}`,
          error.stack,
        );
      } else {
        this.logger.warn(
          `${message} info=${JSON.stringify({
            error: this.mapExceptionFormat(error),
          })}`,
        );
      }
    } else if (error instanceof EntityNotFoundError) {
      const statusCode = HttpStatus.NOT_FOUND;
      const message = `${method} ${url} status=${statusCode} took=${reqDuration} reqId=${reqId}`;
      this.logger.warn(
        `${message} info=${JSON.stringify({
          error: error,
        })}`,
      );
    } else {
      const message = `${method} ${url} took=${reqDuration} reqId=${reqId}`;
      if (error.stack) {
        this.logger.error(
          `${message} info=${JSON.stringify({
            body,
            error,
          })}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `${message} info=${JSON.stringify({
            body,
            error,
          })}`,
        );
      }
    }
  }

  private mapExceptionFormat(exception: HttpException) {
    const res = exception.getResponse();
    return isObject(res)
      ? this.isHttpError(res)
        ? { code: HttpErrorCodeStringByStatusCode[res.statusCode as ErrorHttpStatusCode], message: res.message }
        : res
      : {
          code: HttpErrorCodeStringByStatusCode[exception.getStatus() as ErrorHttpStatusCode],
          message: res,
        };
  }

  /**
   * Checks if the thrown error comes from the "http-errors" library.
   * @param err error object
   */
  private isHttpError(err: any): err is { statusCode: number; message: string } {
    return Number.isSafeInteger(err?.statusCode) && typeof err?.message === 'string';
  }
}
