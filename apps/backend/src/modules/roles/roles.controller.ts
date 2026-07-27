import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermissions('roles:create')
  @ApiOperation({ summary: 'Create a new role' })
  create(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: CreateRoleDto,
  ) {
    return this.rolesService.create(orgId, dto);
  }

  @Get()
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'List all roles' })
  findAll(@CurrentUser('organizationId') orgId: string) {
    return this.rolesService.findAll(orgId);
  }

  @Get('permissions')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'List all available permissions' })
  getPermissions() {
    return this.rolesService.getAllPermissions();
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Get role by ID' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findById(id);
  }

  @Put(':id')
  @RequirePermissions('roles:update')
  @ApiOperation({ summary: 'Update a role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('roles:delete')
  @ApiOperation({ summary: 'Delete a role' })
  remove(@Param('id') id: string) {
    return this.rolesService.delete(id);
  }

  @Post(':id/permissions/:permissionId')
  @RequirePermissions('roles:update')
  @ApiOperation({ summary: 'Assign permission to role' })
  assignPermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.rolesService.assignPermission(id, permissionId);
  }

  @Delete(':id/permissions/:permissionId')
  @RequirePermissions('roles:update')
  @ApiOperation({ summary: 'Remove permission from role' })
  removePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.rolesService.removePermission(id, permissionId);
  }
}
