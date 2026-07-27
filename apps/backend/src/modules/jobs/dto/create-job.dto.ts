import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsInt,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum JobType {
  REPAIR = 'REPAIR',
  INSTALLATION = 'INSTALLATION',
  MAINTENANCE = 'MAINTENANCE',
  EMERGENCY = 'EMERGENCY',
  INSPECTION = 'INSPECTION',
  QUOTE_ONLY = 'QUOTE_ONLY',
  WARRANTY = 'WARRANTY',
  CALLBACK = 'CALLBACK',
}

enum JobPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
  EMERGENCY = 'EMERGENCY',
}

export class CreateJobDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty({ enum: JobType })
  @IsEnum(JobType)
  type: JobType;

  @ApiPropertyOptional({ enum: JobPriority, default: JobPriority.NORMAL })
  @IsOptional()
  @IsEnum(JobPriority)
  priority?: JobPriority;

  @ApiProperty({ example: 'Blocked drain in kitchen' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @ApiPropertyOptional({ description: 'Estimated duration in minutes' })
  @IsOptional()
  @IsInt()
  estimatedDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
