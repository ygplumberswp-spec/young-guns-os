import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('users:create')
  @ApiOperation({ summary: 'Create a new user' })
  create(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(orgId, dto);
  }

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List all users' })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.findAll(orgId, pagination);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('users:update')
  @ApiOperation({ summary: 'Update a user' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @RequirePermissions('users:delete')
  @ApiOperation({ summary: 'Deactivate a user' })
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/activate')
  @RequirePermissions('users:update')
  @ApiOperation({ summary: 'Activate a user' })
  activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }

  @Post(':id/roles/:roleId')
  @RequirePermissions('users:update')
  @ApiOperation({ summary: 'Assign role to user' })
  assignRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.usersService.assignRole(id, roleId);
  }
}
