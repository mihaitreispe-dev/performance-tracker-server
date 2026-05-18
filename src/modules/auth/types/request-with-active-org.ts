import { Request } from 'express';

import { ActiveOrgContext } from '../guards/active-org.guard';
import { AuthUser } from './authenticated-user';

export type AuthedRequest = Request & { user: AuthUser; activeOrg?: ActiveOrgContext };
