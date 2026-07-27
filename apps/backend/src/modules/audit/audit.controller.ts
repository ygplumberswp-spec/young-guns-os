import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { RequirePermissions } from '../../decorators/permissions.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post()
  @ApiOperation({ summary: 'Create an audit log entry' })
  create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { action: string; resource: string; resourceId?: string; metadata?: Record<string, unknown> },
  ) {
    return this.auditService.log({
      organizationId: orgId,
      userId,
      action: dto.action,
      resource: dto.resource,
      resourceId: dto.resourceId,
      metadata: dto.metadata,
    });
  }

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Get audit logs' })
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() pagination: PaginationDto,
    @Query('resource') resource?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.findAll(orgId, {
      ...pagination,
      resource,
      userId,
      action,
      startDate,
      endDate,
    });
  }
}
