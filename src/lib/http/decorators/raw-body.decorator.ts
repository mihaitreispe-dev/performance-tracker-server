import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const RawBody = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.rawBody || null;
});
