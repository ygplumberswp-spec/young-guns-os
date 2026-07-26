import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum JobStatus {
  PENDING = 'PENDING',
  SCHEDULED = 'SCHEDULED',
  DISPATCHED = 'DISPATCHED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SITE = 'ON_SITE',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REQUIRES_FOLLOWUP = 'REQUIRES_FOLLOWUP',
}

export class UpdateJobStatusDto {
  @ApiProperty({ enum: JobStatus })
  @IsEnum(JobStatus)
  status: JobStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
