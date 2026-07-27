import { IsOptional, IsInt, Min, Max, IsString, Allow } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Allow()
  status?: string;

  @IsOptional()
  @Allow()
  date?: string;

  @IsOptional()
  @Allow()
  phone?: string;

  @IsOptional()
  @Allow()
  branchId?: string;

  @IsOptional()
  @Allow()
  category?: string;

  @IsOptional()
  @Allow()
  lowStock?: boolean;

  @IsOptional()
  @Allow()
  assignedToId?: string;

  @IsOptional()
  @Allow()
  completedAfter?: string;

  @IsOptional()
  @Allow()
  completedBefore?: string;

  @IsOptional()
  @Allow()
  hasReview?: string;

  @IsOptional()
  @Allow()
  daysAhead?: string;

  @IsOptional()
  @Allow()
  unreadOnly?: string;
}
