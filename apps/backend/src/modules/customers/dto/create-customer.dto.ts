import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum CustomerType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  STRATA = 'STRATA',
  REAL_ESTATE = 'REAL_ESTATE',
  BUILDER = 'BUILDER',
  GOVERNMENT = 'GOVERNMENT',
}

enum CustomerSource {
  DIRECT = 'DIRECT',
  REFERRAL = 'REFERRAL',
  GOOGLE_ADS = 'GOOGLE_ADS',
  META_ADS = 'META_ADS',
  WEBSITE = 'WEBSITE',
  PHONE = 'PHONE',
  WHATSAPP = 'WHATSAPP',
  PARTNER = 'PARTNER',
  OTHER = 'OTHER',
}

export class CreateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ enum: CustomerType, default: CustomerType.RESIDENTIAL })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({ example: 'Smith Holdings Pty Ltd' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '0412345678' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ example: '0498765432' })
  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @ApiProperty({ enum: CustomerSource, default: CustomerSource.DIRECT })
  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referredBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
