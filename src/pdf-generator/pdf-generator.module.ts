import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfGeneratorController } from './pdf-generator.controller';
import { PdfGeneratorService } from './pdf-generator.service';
import { DocumentModel, DocumentSchema } from '../database/schemas/document.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentModel.name, schema: DocumentSchema },
    ]),
  ],
  controllers: [PdfGeneratorController],
  providers: [PdfGeneratorService],
  exports: [PdfGeneratorService], // Export pour utilisation dans d'autres modules
})
export class PdfGeneratorModule {}

