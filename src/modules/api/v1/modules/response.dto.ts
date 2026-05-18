import { ApiProperty } from '@nestjs/swagger';

export class ModuleDTO {
  @ApiProperty()
  key: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  defaultEnabled: boolean;

  @ApiProperty()
  sortOrder: number;
}

export class ModulesListResponse {
  @ApiProperty({ type: [ModuleDTO] })
  data: ModuleDTO[];
}

export class ResolvedModuleDTO {
  @ApiProperty()
  key: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ description: 'Effective enabled state for this org (and athlete if athleteId was supplied)' })
  enabled: boolean;

  @ApiProperty({ enum: ['default', 'org', 'athlete'], description: 'Where the enabled state came from' })
  source: 'default' | 'org' | 'athlete';
}

export class ResolvedModulesResponse {
  @ApiProperty({ type: [ResolvedModuleDTO] })
  data: ResolvedModuleDTO[];
}
