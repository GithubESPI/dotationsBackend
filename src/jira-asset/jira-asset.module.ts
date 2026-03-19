import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { JiraAssetController } from './jira-asset.controller';
import { JiraAssetService } from './jira-asset.service';
import { Equipment, EquipmentSchema } from '../database/schemas/equipment.schema';
import { AllocationsModule } from '../allocations/allocations.module';
import { PdfGeneratorModule } from '../pdf-generator/pdf-generator.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    MongooseModule.forFeature([
      { name: Equipment.name, schema: EquipmentSchema },
    ]),
    forwardRef(() => AllocationsModule),
    PdfGeneratorModule, // Pour générer les PDFs lors de la synchro Jira
  ],
  controllers: [JiraAssetController],
  providers: [JiraAssetService],
  exports: [JiraAssetService], // Export pour utilisation dans d'autres modules (scheduler)
})
export class JiraAssetModule { }

