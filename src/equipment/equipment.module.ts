import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { Equipment, EquipmentSchema } from '../database/schemas/equipment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Equipment.name, schema: EquipmentSchema }]),
  ],
  controllers: [EquipmentController],
  providers: [EquipmentService],
  exports: [EquipmentService], // Export pour utilisation dans d'autres modules (allocations, returns)
})
export class EquipmentModule {}

