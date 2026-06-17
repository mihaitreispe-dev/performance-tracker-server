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

// ---- Platform overview ------------------------------------------------------

export class AdminOverviewDTO {
  @ApiProperty() organisations: number;
  @ApiProperty() users: number;
  @ApiProperty({ description: 'Users with a sign-in in the last 7 days.' }) activeUsers7d: number;
  @ApiProperty({ description: 'Users with a sign-in in the last 30 days.' }) activeUsers30d: number;
  @ApiProperty() coaches: number;
  @ApiProperty() athletes: number;
  @ApiProperty({ description: 'Workout executions completed in the last 30 days.' }) workouts30d: number;
  @ApiProperty({ description: 'Snack completions in the last 30 days.' }) snacks30d: number;
  @ApiProperty({ description: 'API requests in the last 30 days (rolled-up daily counts).' }) apiRequests30d: number;
}

export class AdminOverviewResponse {
  @ApiProperty({ type: AdminOverviewDTO }) data: AdminOverviewDTO;
}

// ---- Org detail -------------------------------------------------------------

export class AdminRosterDTO {
  @ApiProperty() owners: number;
  @ApiProperty() admins: number;
  @ApiProperty() coaches: number;
  @ApiProperty() athletes: number;
  @ApiProperty() total: number;
}

export class AdminModuleStateDTO {
  @ApiProperty() key: string;
  @ApiProperty() name: string;
  @ApiProperty() enabled: boolean;
}

export class AdminOrganisationDetailDTO {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl: string | null;
  @ApiProperty() orgType: string;
  @ApiProperty() allowsSelfSignup: boolean;
  @ApiProperty() usesExternalApp: boolean;
  @ApiProperty({ type: AdminRosterDTO }) roster: AdminRosterDTO;
  @ApiProperty({ type: [AdminModuleStateDTO] }) modules: AdminModuleStateDTO[];
  @ApiProperty({ description: 'Count of non-revoked API keys.' }) activeApiKeys: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Most recent activity (workout/snack) across members.' })
  lastActiveAt: string | null;
  @ApiProperty() createdAt: string;
}

export class AdminOrganisationDetailResponse {
  @ApiProperty({ type: AdminOrganisationDetailDTO }) data: AdminOrganisationDetailDTO;
}

// ---- Activity report --------------------------------------------------------

export class AdminActivityPointDTO {
  @ApiProperty({ description: 'UTC calendar day (YYYY-MM-DD).' }) date: string;
  @ApiProperty() workouts: number;
  @ApiProperty() snacks: number;
}

export class AdminActivityDTO {
  @ApiProperty({ type: [AdminActivityPointDTO] }) series: AdminActivityPointDTO[];
  @ApiProperty({ description: 'Distinct members active (workout or snack) in the range.' }) activeMembers: number;
  @ApiProperty() totalWorkouts: number;
  @ApiProperty() totalSnacks: number;
}

export class AdminActivityResponse {
  @ApiProperty({ type: AdminActivityDTO }) data: AdminActivityDTO;
}
