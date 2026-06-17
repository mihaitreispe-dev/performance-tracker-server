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

export class AdminModuleListResponse {
  @ApiProperty({ type: [AdminModuleStateDTO], description: 'Module registry; `enabled` = the default-enabled flag.' })
  data: AdminModuleStateDTO[];
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

// ---- API keys ---------------------------------------------------------------

export class AdminApiKeyDTO {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'Visible key prefix (e.g. sz_live_a1b2c3d4).' }) keyPrefix: string;
  @ApiProperty({ type: [String] }) scopes: string[];
  @ApiProperty() isPublicClient: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) lastUsedAt: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) revokedAt: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) expiresAt: string | null;
  @ApiProperty() createdAt: string;
}

export class AdminApiKeyListResponse {
  @ApiProperty({ type: [AdminApiKeyDTO] }) data: AdminApiKeyDTO[];
}

export class AdminIssuedApiKeyDTO {
  @ApiProperty({ description: 'The full cleartext key — shown ONCE; store it now.' }) key: string;
  @ApiProperty({ type: AdminApiKeyDTO }) apiKey: AdminApiKeyDTO;
}

export class AdminIssuedApiKeyResponse {
  @ApiProperty({ type: AdminIssuedApiKeyDTO }) data: AdminIssuedApiKeyDTO;
}

// ---- API usage --------------------------------------------------------------

export class AdminUsageDayDTO {
  @ApiProperty() date: string;
  @ApiProperty() requests: number;
  @ApiProperty() errors: number;
}

export class AdminUsageEndpointDTO {
  @ApiProperty() endpoint: string;
  @ApiProperty() requests: number;
  @ApiProperty() errors: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) p95ResponseMs: number | null;
}

export class AdminApiUsageDTO {
  @ApiProperty({ type: [AdminUsageDayDTO] }) series: AdminUsageDayDTO[];
  @ApiProperty({ type: [AdminUsageEndpointDTO], description: 'Top endpoints by request volume.' }) endpoints: AdminUsageEndpointDTO[];
  @ApiProperty() totalRequests: number;
  @ApiProperty() totalErrors: number;
}

export class AdminApiUsageResponse {
  @ApiProperty({ type: AdminApiUsageDTO }) data: AdminApiUsageDTO;
}

// ---- Onboarding result ------------------------------------------------------

export class AdminOnboardResultDTO {
  @ApiProperty({ type: AdminOrganisationDetailDTO }) organisation: AdminOrganisationDetailDTO;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Cleartext of the issued API key — shown ONCE.' })
  apiKey: string | null;
}

export class AdminOnboardResponse {
  @ApiProperty({ type: AdminOnboardResultDTO }) data: AdminOnboardResultDTO;
}
