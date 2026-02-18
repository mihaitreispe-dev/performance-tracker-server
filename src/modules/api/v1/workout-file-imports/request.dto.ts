import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { WorkoutFileFormat } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class RequestUploadBody {
  @ApiProperty({ description: 'Original file name' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: 'File format', enum: WorkoutFileFormat })
  @IsEnumString(WorkoutFileFormat)
  fileFormat: WorkoutFileFormat;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @Min(1)
  @Max(50 * 1024 * 1024) // 50MB max
  fileSizeBytes: number;

  @ApiPropertyOptional({ description: 'Optional workout schedule ID to link import to' })
  @IsOptional()
  @IsUUID()
  workoutScheduleId?: string;
}

export class WorkoutFileImportIdParam {
  @ApiProperty()
  @IsUUID()
  id: string;
}
