import { IsString, IsOptional, IsEnum, IsDateString, IsEmail, Allow } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum BookingSource {
  PHONE = 'PHONE',
  WEBSITE = 'WEBSITE',
  WHATSAPP = 'WHATSAPP',
  AI_RECEPTIONIST = 'AI_RECEPTIONIST',
  CUSTOMER_PORTAL = 'CUSTOMER_PORTAL',
  PARTNER = 'PARTNER',
}

export class CreateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'John Smith' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: '0412345678' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledDate?: string;

  @ApiPropertyOptional({ example: '09:00-11:00' })
  @IsOptional()
  @IsString()
  preferredTimeSlot?: string;

  @ApiPropertyOptional({ enum: BookingSource })
  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiSummary?: string;

  @IsOptional()
  @Allow()
  metadata?: any;
}
