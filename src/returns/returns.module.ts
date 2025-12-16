import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { Return, ReturnSchema } from '../database/schemas/return.schema';
import { Allocation, AllocationSchema } from '../database/schemas/allocation.schema';
import { Equipment, EquipmentSchema } from '../database/schemas/equipment.schema';
import { User, UserSchema } from '../database/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Return.name, schema: ReturnSchema },
      { name: Allocation.name, schema: AllocationSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService], // Export pour utilisation dans d'autres modules (pdf-generator)
})
export class ReturnsModule {}

