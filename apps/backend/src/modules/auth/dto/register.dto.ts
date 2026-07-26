import { IsEmail, IsString, MinLength, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'john@younggunsplumbing.com.au' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '0412345678', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty()
  @IsUUID()
  organizationId: string;
}
