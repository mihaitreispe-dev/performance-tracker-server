import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganisationRole, OrganisationType } from 'src/database/interfaces';

export class OrganisationDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiProperty({
    enum: OrganisationType,
    description:
      "Signup track. UI gating (e.g. hiding the Team tab on individual orgs) keys off this.",
  })
  orgType: OrganisationType;

  @ApiProperty({
    description:
      'When true, the client-app subdomain shows a self-signup form for general-population clients.',
  })
  allowsSelfSignup: boolean;

  @ApiProperty()
  createdAt: string;
}

/**
 * Public, anonymous-safe view of an org used by the client-app signup page.
 * Returns just enough to render branding (logo + name) + whether the visitor
 * is allowed to self-register. No member counts, ids of related rows, etc.
 */
export class PublicOrganisationDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiProperty({ enum: OrganisationType })
  orgType: OrganisationType;

  @ApiProperty()
  allowsSelfSignup: boolean;
}

export class PublicOrganisationResponse {
  @ApiProperty({ type: PublicOrganisationDTO })
  data: PublicOrganisationDTO;
}

export class OrganisationResponse {
  @ApiProperty({ type: OrganisationDTO })
  data: OrganisationDTO;
}

export class MyOrganisationDTO extends OrganisationDTO {
  @ApiProperty({ enum: OrganisationRole })
  myRole: OrganisationRole;
}

export class MyOrganisationsListResponse {
  @ApiProperty({ type: [MyOrganisationDTO] })
  data: MyOrganisationDTO[];
}

export class LogoUploadDTO {
  @ApiProperty({ description: 'Presigned PUT URL valid for 1 hour' })
  uploadUrl: string;

  @ApiProperty()
  bucket: string;

  @ApiProperty()
  key: string;
}

export class LogoUploadResponse {
  @ApiProperty({ type: LogoUploadDTO })
  data: LogoUploadDTO;
}

export class PendingInvitationDTO {
  @ApiProperty({ description: 'The membership row id; pass to POST /:id/memberships/:membershipId/accept' })
  membershipId: string;

  @ApiProperty({ type: OrganisationDTO })
  organisation: OrganisationDTO;

  @ApiProperty({ enum: OrganisationRole })
  role: OrganisationRole;

  @ApiProperty()
  invitedAt: string;

  @ApiPropertyOptional({ nullable: true })
  invitedByUserId: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Personal note from the inviter' })
  invitationMessage: string | null;
}

export class PendingInvitationsListResponse {
  @ApiProperty({ type: [PendingInvitationDTO] })
  data: PendingInvitationDTO[];
}
