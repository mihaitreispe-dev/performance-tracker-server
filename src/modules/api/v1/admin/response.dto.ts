import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganisationRole, UserRole } from 'src/database/interfaces';

export class AdminUserDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  picture: string | null;

  @ApiProperty({ type: [String], enum: UserRole })
  roles: UserRole[];

  @ApiProperty()
  createdAt: string;
}

export class AdminUserListResponse {
  @ApiProperty({ type: [AdminUserDTO] })
  data: AdminUserDTO[];
}

export class AdminOrganisationDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  logoUrl: string | null;

  @ApiProperty({ enum: OrganisationRole, nullable: true, description: 'Your membership role, or null if you are not a member (admin bypass).' })
  myRole: OrganisationRole | null;

  @ApiProperty()
  memberCount: number;

  @ApiProperty()
  createdAt: string;
}

export class AdminOrganisationListResponse {
  @ApiProperty({ type: [AdminOrganisationDTO] })
  data: AdminOrganisationDTO[];
}
