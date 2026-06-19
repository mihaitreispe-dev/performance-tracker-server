import { InternalServerErrorException } from '@nestjs/common';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';

export function assertActiveOrg(req: AuthedRequest): string {
  if (!req.activeOrg) {
    throw new InternalServerErrorException(
      'No active organisation on request. The token needs an `org` claim or the request needs an X-Organisation-Id header — or apply @SkipActiveOrg() to a route that does not need an org.',
    );
  }
  return req.activeOrg.organisationId;
}
