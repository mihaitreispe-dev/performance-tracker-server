import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from 'src/database/interfaces';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class AppAccessControlService {
  constructor(private readonly userRepo: UserRepository) {}

  async getRoles({ userId }: { userId: string }): Promise<Array<UserRole>> {
    const ownRoles = await this.userRepo.findRolesByUserId(userId);
    return ownRoles;
  }

  async hasOneOfRoles({ userId, roles }: { userId: string; roles: UserRole[] }) {
    const ownRoles = await this.getRoles({ userId });
    const result = ownRoles.some((ownRole) => roles.includes(ownRole));
    return result;
  }

  async hasOneOfRolesOrThrow({ userId, roles }: { userId: string; roles: UserRole[] }) {
    const result = await this.hasOneOfRoles({ userId, roles });
    if (!result) {
      throw new ForbiddenException();
    }
  }
}
