import { IsString, IsOptional, IsEnum, IsDateString, IsEmail } from 'class-validator';
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
  @ApiProperty({ example: 'John Smith' })
  @IsString()
  customerName: string;

  @ApiProperty({ example: '0412345678' })
  @IsString()
  customerPhone: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiProperty()
  @IsDateString()
  preferredDate: string;

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
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiSummary?: string;
}
