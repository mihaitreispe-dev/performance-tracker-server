import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientType, CoachAthleteStatus, OrganisationRole } from 'src/database/interfaces';

export class MembershipDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organisationId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userEmail: string;

  @ApiPropertyOptional({ nullable: true })
  userDisplayName: string | null;

  @ApiProperty({ enum: OrganisationRole })
  role: OrganisationRole;

  @ApiPropertyOptional({
    enum: ClientType,
    nullable: true,
    description:
      "Athlete sub-track: 'general' | 'athlete'. Null for non-athlete roles.",
  })
  clientType: ClientType | null;

  @ApiPropertyOptional({ nullable: true })
  invitedByUserId: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Personal note included by the inviter' })
  invitationMessage: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'External per-(user, org) profile data set by the integrating app.',
  })
  metadata: Record<string, unknown>;

  @ApiProperty()
  invitedAt: string;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt: string | null;

  /**
   * Coach-athlete relationship status between the *caller* and this
   * member, scoped to the current org. Present only when (a) the
   * caller is a COACH in this org, (b) this row is an ATHLETE, and
   * (c) a row exists in coach_athlete_relationships for the pair.
   * Null everywhere else — including owner/admin viewers, since they
   * don't have a 1:1 coaching binding to surface.
   *
   * Lets the Members tab disambiguate "athlete accepted the org
   * invite but hasn't acknowledged the coaching relationship yet"
   * (PENDING) from "fully linked" (ACTIVE).
   */
  @ApiPropertyOptional({
    enum: CoachAthleteStatus,
    nullable: true,
    description:
      "Coach-athlete relationship status between the caller (when the caller is a coach) and this athlete row. Null otherwise.",
  })
  coachRelationshipStatus: CoachAthleteStatus | null;
}

export class MembershipResponse {
  @ApiProperty({ type: MembershipDTO })
  data: MembershipDTO;
}

export class MembershipsListResponse {
  @ApiProperty({ type: [MembershipDTO] })
  data: MembershipDTO[];
}
