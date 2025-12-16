import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PdfGeneratorService } from './pdf-generator.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('PDF Generator')
@Controller('pdf')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class PdfGeneratorController {
  constructor(private readonly pdfGeneratorService: PdfGeneratorService) {}

  @Post('allocation/:allocationId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Générer le PDF de dotation',
    description: 'Génère le PDF de dotation pour une allocation donnée et le stocke dans GridFS',
  })
  @ApiParam({ name: 'allocationId', description: 'ID MongoDB de l\'allocation' })
  @ApiResponse({
    status: 201,
    description: 'PDF généré avec succès',
  })
  @ApiResponse({ status: 404, description: 'Allocation non trouvée' })
  async generateAllocationPDF(@Param('allocationId') allocationId: string) {
    return this.pdfGeneratorService.generateAllocationPDF(allocationId);
  }

  @Post('return/:returnId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Générer le PDF de restitution',
    description: 'Génère le PDF de restitution pour une restitution donnée et le stocke dans GridFS',
  })
  @ApiParam({ name: 'returnId', description: 'ID MongoDB de la restitution' })
  @ApiResponse({
    status: 201,
    description: 'PDF généré avec succès',
  })
  @ApiResponse({ status: 404, description: 'Restitution non trouvée' })
  async generateReturnPDF(@Param('returnId') returnId: string) {
    return this.pdfGeneratorService.generateReturnPDF(returnId);
  }

  @Get('document/:documentId')
  @ApiOperation({ 
    summary: 'Télécharger un PDF',
    description: 'Récupère un PDF depuis GridFS par son ID de document',
  })
  @ApiParam({ name: 'documentId', description: 'ID MongoDB du document' })
  @ApiResponse({
    status: 200,
    description: 'PDF téléchargé avec succès',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Document non trouvé' })
  async getPDF(@Param('documentId') documentId: string, @Res() res: Response) {
    const { stream, filename, size } = await this.pdfGeneratorService.getPDF(documentId);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', size);
    
    stream.pipe(res);
  }
}

