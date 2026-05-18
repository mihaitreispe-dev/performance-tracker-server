import { InternalServerErrorException } from '@nestjs/common';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';

export function assertActiveOrg(req: AuthedRequest): string {
  if (!req.activeOrg) {
    throw new InternalServerErrorException(
      'No active organisation on request. Did you forget the X-Organisation-Id header, or apply @SkipActiveOrg() to a route that needs an org?',
    );
  }
  return req.activeOrg.organisationId;
}
