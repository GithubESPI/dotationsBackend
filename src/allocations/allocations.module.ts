import { Module, forwardRef, Inject } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AllocationsController } from './allocations.controller';
import { AllocationsService } from './allocations.service';
import { Allocation, AllocationSchema } from '../database/schemas/allocation.schema';
import { Equipment, EquipmentSchema } from '../database/schemas/equipment.schema';
import { User, UserSchema } from '../database/schemas/user.schema';
import { JiraAssetModule } from '../jira-asset/jira-asset.module';
import { JiraAssetService } from '../jira-asset/jira-asset.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Allocation.name, schema: AllocationSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => JiraAssetModule), // Import circulaire pour permettre la synchronisation Jira
  ],
  controllers: [AllocationsController],
  providers: [AllocationsService],
  exports: [AllocationsService], // Export pour utilisation dans d'autres modules (returns, pdf-generator)
})
export class AllocationsModule {
  constructor(
    private allocationsService: AllocationsService,
    @Inject(forwardRef(() => JiraAssetService)) private jiraAssetService: JiraAssetService,
  ) {
    // Injecter le service Jira Asset dans le service Allocations pour permettre la synchronisation
    this.allocationsService.setJiraAssetService(this.jiraAssetService);
  }
}

