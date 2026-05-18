import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganisationRole } from 'src/database/interfaces';

export class OrganisationDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  logoUrl: string | null;

  @ApiProperty()
  createdAt: string;
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
