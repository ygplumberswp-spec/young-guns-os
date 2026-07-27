import { Module } from '@nestjs/common';
import { MultiBranchService } from './multi-branch.service';

@Module({
  providers: [MultiBranchService],
  exports: [MultiBranchService],
})
export class MultiBranchModule {}
