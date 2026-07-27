import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateJobDto } from './create-job.dto';

export class UpdateJobDto extends PartialType(
  OmitType(CreateJobDto, ['branchId', 'customerId', 'propertyId'] as const),
) {}
