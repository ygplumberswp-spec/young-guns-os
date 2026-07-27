import { IsString, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'Branch Manager' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'branch-manager' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug: string;

  @ApiPropertyOptional({ example: 'Manages a branch' })
  @IsOptional()
  @IsString()
  description?: string;
}
