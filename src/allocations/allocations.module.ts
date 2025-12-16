import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AllocationsController } from './allocations.controller';
import { AllocationsService } from './allocations.service';
import { Allocation, AllocationSchema } from '../database/schemas/allocation.schema';
import { Equipment, EquipmentSchema } from '../database/schemas/equipment.schema';
import { User, UserSchema } from '../database/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Allocation.name, schema: AllocationSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AllocationsController],
  providers: [AllocationsService],
  exports: [AllocationsService], // Export pour utilisation dans d'autres modules (returns, pdf-generator)
})
export class AllocationsModule {}

