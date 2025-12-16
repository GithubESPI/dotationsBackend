import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { GridFSBucket } from 'mongodb';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentModel, DocumentDocument, DocumentType, DocumentStatus } from '../database/schemas/document.schema';
import { Allocation, AllocationDocument } from '../database/schemas/allocation.schema';
import { Return, ReturnDocument } from '../database/schemas/return.schema';
import { User, UserDocument } from '../database/schemas/user.schema';

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly CHARTE_VERSION = '1.0'; // Version de la charte d'utilisation

  constructor(
    @InjectConnection() private connection: Connection,
    @InjectModel(DocumentModel.name) private documentModel: Model<DocumentDocument>,
  ) {}

  /**
   * Générer le PDF de dotation et le stocker dans GridFS
   */
  async generateAllocationPDF(allocationId: string): Promise<DocumentDocument> {
    // Récupérer l'allocation avec toutes les données nécessaires
    const allocation = await this.connection
      .model<AllocationDocument>('Allocation')
      .findById(allocationId)
      .populate('userId', 'displayName email department officeLocation')
      .populate('equipments.equipmentId', 'brand model serialNumber type internalId jiraAssetId')
      .exec();

    if (!allocation) {
      throw new NotFoundException(`Allocation avec l'ID ${allocationId} non trouvée`);
    }

    const user = allocation.userId as any as UserDocument;
    if (!user) {
      throw new NotFoundException('Utilisateur associé à l\'allocation non trouvé');
    }

    // Générer le PDF
    const pdfBuffer = await this.createAllocationPDFBuffer(allocation, user);

    // Stocker dans GridFS
    const bucket = this.getGridFSBucket();
    const filename = `dotation_${allocation._id}_${Date.now()}.pdf`;
    const uploadStream = bucket.openUploadStream(filename);

    return new Promise((resolve, reject) => {
      uploadStream.on('finish', async () => {
        try {
          // Créer l'entrée Document dans MongoDB
          const equipmentsList = allocation.equipments.map(
            eq => `${(eq.equipmentId as any)?.brand || 'N/A'} ${(eq.equipmentId as any)?.model || 'N/A'} - ${(eq.equipmentId as any)?.serialNumber || 'N/A'}`,
          );

          // Générer le QR code
          const qrCodeData = await this.generateQRCode(allocation._id.toString(), 'allocation');

          const document = new this.documentModel({
            documentType: DocumentType.DOTATION,
            allocationId: allocation._id,
            fileId: uploadStream.id,
            filename,
            mimeType: 'application/pdf',
            fileSize: pdfBuffer.length,
            metadata: {
              userName: user.displayName || user.email,
              equipmentsList,
              charterVersion: this.CHARTE_VERSION,
              qrCode: qrCodeData,
            },
            status: DocumentStatus.PENDING,
          });

          const savedDoc = await document.save();

          // Mettre à jour l'allocation avec l'ID du document
          await this.connection
            .model<AllocationDocument>('Allocation')
            .findByIdAndUpdate(allocationId, { documentId: savedDoc._id })
            .exec();

          this.logger.log(`✅ PDF de dotation généré: ${filename} (${pdfBuffer.length} bytes)`);
          resolve(savedDoc);
        } catch (error) {
          this.logger.error(`❌ Erreur lors de la création du document: ${error.message}`);
          reject(error);
        }
      });

      uploadStream.on('error', (error) => {
        this.logger.error(`❌ Erreur lors de l'upload GridFS: ${error.message}`);
        reject(error);
      });

      uploadStream.end(pdfBuffer);
    });
  }

  /**
   * Générer le PDF de restitution et le stocker dans GridFS
   */
  async generateReturnPDF(returnId: string): Promise<DocumentDocument> {
    // Récupérer la restitution avec toutes les données nécessaires
    const returnDoc = await this.connection
      .model<ReturnDocument>('Return')
      .findById(returnId)
      .populate('allocationId', 'deliveryDate equipments')
      .populate('userId', 'displayName email department officeLocation')
      .populate('equipmentsReturned.equipmentId', 'brand model serialNumber type internalId')
      .exec();

    if (!returnDoc) {
      throw new NotFoundException(`Restitution avec l'ID ${returnId} non trouvée`);
    }

    const user = returnDoc.userId as any as UserDocument;
    if (!user) {
      throw new NotFoundException('Utilisateur associé à la restitution non trouvé');
    }

    // Générer le PDF
    const pdfBuffer = await this.createReturnPDFBuffer(returnDoc, user);

    // Stocker dans GridFS
    const bucket = this.getGridFSBucket();
    const filename = `restitution_${returnDoc._id}_${Date.now()}.pdf`;
    const uploadStream = bucket.openUploadStream(filename);

    return new Promise((resolve, reject) => {
      uploadStream.on('finish', async () => {
        try {
          // Créer l'entrée Document dans MongoDB
          const equipmentsList = returnDoc.equipmentsReturned.map(
            eq => `${(eq.equipmentId as any)?.brand || 'N/A'} ${(eq.equipmentId as any)?.model || 'N/A'} - ${(eq.equipmentId as any)?.serialNumber || 'N/A'}`,
          );

          // Générer le QR code
          const qrCodeData = await this.generateQRCode(returnDoc._id.toString(), 'return');

          const document = new this.documentModel({
            documentType: DocumentType.RESTITUTION,
            returnId: returnDoc._id,
            fileId: uploadStream.id,
            filename,
            mimeType: 'application/pdf',
            fileSize: pdfBuffer.length,
            metadata: {
              userName: user.displayName || user.email,
              equipmentsList,
              charterVersion: this.CHARTE_VERSION,
              qrCode: qrCodeData,
            },
            status: returnDoc.completedAt ? DocumentStatus.SIGNED : DocumentStatus.PENDING,
          });

          const savedDoc = await document.save();

          // Mettre à jour la restitution avec l'ID du document
          await this.connection
            .model<ReturnDocument>('Return')
            .findByIdAndUpdate(returnId, { returnDocumentId: savedDoc._id })
            .exec();

          this.logger.log(`✅ PDF de restitution généré: ${filename} (${pdfBuffer.length} bytes)`);
          resolve(savedDoc);
        } catch (error) {
          this.logger.error(`❌ Erreur lors de la création du document: ${error.message}`);
          reject(error);
        }
      });

      uploadStream.on('error', (error) => {
        this.logger.error(`❌ Erreur lors de l'upload GridFS: ${error.message}`);
        reject(error);
      });

      uploadStream.end(pdfBuffer);
    });
  }

  /**
   * Créer le buffer PDF pour une dotation
   */
  private async createAllocationPDFBuffer(
    allocation: AllocationDocument,
    user: UserDocument,
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // En-tête
        doc.fontSize(20).font('Helvetica-Bold').text('BON DE DOTATION DE MATÉRIEL INFORMATIQUE', {
          align: 'center',
        });
        doc.moveDown(2);

        // Informations utilisateur
        doc.fontSize(14).font('Helvetica-Bold').text('INFORMATIONS UTILISATEUR', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');
        doc.text(`Nom: ${user.displayName || 'N/A'}`);
        doc.text(`Email: ${user.email || 'N/A'}`);
        doc.text(`Département: ${user.department || 'N/A'}`);
        if (user.officeLocation) {
          doc.text(`Localisation: ${user.officeLocation}`);
        }
        doc.moveDown(1);

        // Date de dotation
        doc.fontSize(14).font('Helvetica-Bold').text('DATE DE DOTATION', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');
        doc.text(
          `Date: ${allocation.deliveryDate ? new Date(allocation.deliveryDate).toLocaleDateString('fr-FR') : 'N/A'}`,
        );
        doc.moveDown(1);

        // Matériel alloué
        doc.fontSize(14).font('Helvetica-Bold').text('MATÉRIEL ALLOUÉ', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');

        allocation.equipments.forEach((eq, index) => {
          const equipment = eq.equipmentId as any;
          doc.text(`${index + 1}. ${equipment?.brand || 'N/A'} ${equipment?.model || 'N/A'}`);
          doc.text(`   N° de série: ${equipment?.serialNumber || 'N/A'}`);
          if (equipment?.internalId) {
            doc.text(`   N° interne: ${equipment.internalId}`);
          }
          if (equipment?.jiraAssetId) {
            doc.text(`   ID Jira Asset: ${equipment.jiraAssetId}`);
          }
          doc.moveDown(0.5);
        });

        // Accessoires et logiciels
        if (allocation.accessories && allocation.accessories.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(14).font('Helvetica-Bold').text('ACCESSOIRES', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica');
          allocation.accessories.forEach((acc, index) => {
            doc.text(`${index + 1}. ${acc}`);
          });
        }

        if (allocation.additionalSoftware && allocation.additionalSoftware.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(14).font('Helvetica-Bold').text('LOGICIELS SUPPLÉMENTAIRES', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica');
          allocation.additionalSoftware.forEach((sw, index) => {
            doc.text(`${index + 1}. ${sw}`);
          });
        }

        if (allocation.services && allocation.services.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(14).font('Helvetica-Bold').text('SERVICES', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica');
          allocation.services.forEach((svc, index) => {
            doc.text(`${index + 1}. ${svc}`);
          });
        }

        doc.moveDown(2);

        // Charte d'utilisation
        doc.fontSize(14).font('Helvetica-Bold').text('CHARTE D\'UTILISATION DU MATÉRIEL INFORMATIQUE', {
          underline: true,
        });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(
          'En signant ce document, je m\'engage à respecter les règles d\'utilisation du matériel informatique de l\'entreprise.',
          { align: 'justify' },
        );
        doc.moveDown(0.5);
        doc.text(
          '1. Le matériel m\'est confié à titre professionnel uniquement. Je m\'engage à l\'utiliser conformément aux politiques de sécurité de l\'entreprise.',
          { align: 'justify' },
        );
        doc.moveDown(0.3);
        doc.text(
          '2. Je suis responsable de la sécurité physique du matériel. En cas de perte ou de vol, je dois immédiatement informer le service IT.',
          { align: 'justify' },
        );
        doc.moveDown(0.3);
        doc.text(
          '3. Je m\'engage à ne pas installer de logiciels non autorisés et à respecter les politiques de sécurité informatique.',
          { align: 'justify' },
        );
        doc.moveDown(0.3);
        doc.text(
          '4. En cas de départ de l\'entreprise, je m\'engage à restituer l\'intégralité du matériel dans l\'état où il m\'a été confié.',
          { align: 'justify' },
        );
        doc.moveDown(0.3);
        doc.text(
          '5. Toute utilisation non conforme peut entraîner des sanctions disciplinaires et/ou des poursuites judiciaires.',
          { align: 'justify' },
        );
        doc.moveDown(1);
        doc.fontSize(9).font('Helvetica-Oblique');
        doc.text(`Version de la charte: ${this.CHARTE_VERSION}`, { align: 'right' });

        // Espace pour signatures
        doc.moveDown(2);
        doc.fontSize(12).font('Helvetica-Bold').text('SIGNATURES', { underline: true });
        doc.moveDown(1);

        // Signature utilisateur
        doc.fontSize(10).font('Helvetica');
        doc.text('Utilisateur:', { continued: false });
        doc.moveDown(2);
        doc.text('_________________________', { align: 'left' });
        doc.text(`${user.displayName || user.email}`, { align: 'left' });
        doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, { align: 'left' });

        // Signature IT
        doc.moveDown(1.5);
        doc.text('Responsable IT:', { continued: false });
        doc.moveDown(2);
        doc.text('_________________________', { align: 'left' });
        doc.text('Nom: _________________________', { align: 'left' });
        doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, { align: 'left' });

        // QR Code
        doc.moveDown(2);
        const qrCodeData = await this.generateQRCode(allocation._id.toString(), 'allocation');
        const qrCodeImage = await QRCode.toBuffer(qrCodeData, { width: 150, margin: 1 });
        doc.image(qrCodeImage, doc.page.width - 200, doc.page.height - 200, {
          fit: [150, 150],
          align: 'right',
        });
        doc.fontSize(8).font('Helvetica-Oblique');
        doc.text('QR Code de vérification', doc.page.width - 200, doc.page.height - 50, {
          align: 'right',
        });

        // Pied de page
        doc.fontSize(8).font('Helvetica');
        doc.text(
          `Document généré le ${new Date().toLocaleString('fr-FR')} - ID Allocation: ${allocation._id}`,
          { align: 'center' },
        );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Créer le buffer PDF pour une restitution
   */
  private async createReturnPDFBuffer(
    returnDoc: ReturnDocument,
    user: UserDocument,
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // En-tête
        doc.fontSize(20).font('Helvetica-Bold').text('BON DE RESTITUTION DE MATÉRIEL INFORMATIQUE', {
          align: 'center',
        });
        doc.moveDown(2);

        // Informations utilisateur
        doc.fontSize(14).font('Helvetica-Bold').text('INFORMATIONS UTILISATEUR', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');
        doc.text(`Nom: ${user.displayName || 'N/A'}`);
        doc.text(`Email: ${user.email || 'N/A'}`);
        doc.text(`Département: ${user.department || 'N/A'}`);
        doc.moveDown(1);

        // Date de restitution
        doc.fontSize(14).font('Helvetica-Bold').text('DATE DE RESTITUTION', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');
        doc.text(
          `Date: ${returnDoc.returnDate ? new Date(returnDoc.returnDate).toLocaleDateString('fr-FR') : 'N/A'}`,
        );
        doc.moveDown(1);

        // Matériel restitué
        doc.fontSize(14).font('Helvetica-Bold').text('MATÉRIEL RESTITUÉ', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica');

        returnDoc.equipmentsReturned.forEach((eq, index) => {
          const equipment = eq.equipmentId as any;
          doc.text(`${index + 1}. ${equipment?.brand || 'N/A'} ${equipment?.model || 'N/A'}`);
          doc.text(`   N° de série: ${eq.serialNumber || equipment?.serialNumber || 'N/A'}`);
          if (eq.internalId || equipment?.internalId) {
            doc.text(`   N° interne: ${eq.internalId || equipment?.internalId}`);
          }
          doc.text(`   État: ${this.getConditionLabel(eq.condition)}`);
          if (eq.notes) {
            doc.text(`   Notes: ${eq.notes}`, { indent: 20 });
          }
          doc.moveDown(0.5);
        });

        // Logiciels supprimés
        if (returnDoc.removedSoftware && returnDoc.removedSoftware.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(14).font('Helvetica-Bold').text('LOGICIELS SUPPRIMÉS', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica');
          returnDoc.removedSoftware.forEach((sw, index) => {
            doc.text(`${index + 1}. ${sw}`);
          });
        }

        doc.moveDown(2);

        // Signatures
        doc.fontSize(14).font('Helvetica-Bold').text('SIGNATURES', { underline: true });
        doc.moveDown(1);

        // Signature utilisateur
        doc.fontSize(10).font('Helvetica');
        doc.text('Utilisateur:', { continued: false });
        if (returnDoc.signatureDataEmployee) {
          const sigImage = Buffer.from(returnDoc.signatureDataEmployee.signatureImage, 'base64');
          doc.image(sigImage, 50, doc.y, { fit: [150, 50] });
          doc.moveDown(1);
        } else {
          doc.moveDown(2);
          doc.text('_________________________', { align: 'left' });
        }
        doc.text(`${user.displayName || user.email}`, { align: 'left' });
        doc.text(
          `Date: ${returnDoc.signatureDataEmployee?.timestamp ? new Date(returnDoc.signatureDataEmployee.timestamp).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}`,
          { align: 'left' },
        );

        // Signature IT
        doc.moveDown(1.5);
        doc.text('Responsable IT:', { continued: false });
        if (returnDoc.signatureDataIT) {
          const sigImage = Buffer.from(returnDoc.signatureDataIT.signatureImage, 'base64');
          doc.image(sigImage, 50, doc.y, { fit: [150, 50] });
          doc.moveDown(1);
        } else {
          doc.moveDown(2);
          doc.text('_________________________', { align: 'left' });
        }
        doc.text(`${returnDoc.signatureDataIT?.signerName || '_________________________'}`, {
          align: 'left',
        });
        doc.text(
          `Date: ${returnDoc.signatureDataIT?.timestamp ? new Date(returnDoc.signatureDataIT.timestamp).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}`,
          { align: 'left' },
        );

        // Signature RH
        doc.moveDown(1.5);
        doc.text('Responsable RH:', { continued: false });
        if (returnDoc.signatureDataHR) {
          const sigImage = Buffer.from(returnDoc.signatureDataHR.signatureImage, 'base64');
          doc.image(sigImage, 50, doc.y, { fit: [150, 50] });
          doc.moveDown(1);
        } else {
          doc.moveDown(2);
          doc.text('_________________________', { align: 'left' });
        }
        doc.text(`${returnDoc.signatureDataHR?.signerName || '_________________________'}`, {
          align: 'left',
        });
        doc.text(
          `Date: ${returnDoc.signatureDataHR?.timestamp ? new Date(returnDoc.signatureDataHR.timestamp).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}`,
          { align: 'left' },
        );

        // Validation RH
        if (returnDoc.rhValidation) {
          doc.moveDown(1.5);
          doc.fontSize(12).font('Helvetica-Bold').text('VALIDATION RH', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica');
          doc.text(`Validé par: ${returnDoc.rhValidation.validatedBy}`);
          doc.text(
            `Date de validation: ${new Date(returnDoc.rhValidation.validatedAt).toLocaleDateString('fr-FR')}`,
          );
          doc.text(
            `Solde de tout compte: ${returnDoc.rhValidation.soldeToutCompte ? 'Oui' : 'Non'}`,
          );
        }

        // QR Code
        doc.moveDown(2);
        const qrCodeData = await this.generateQRCode(returnDoc._id.toString(), 'return');
        const qrCodeImage = await QRCode.toBuffer(qrCodeData, { width: 150, margin: 1 });
        doc.image(qrCodeImage, doc.page.width - 200, doc.page.height - 200, {
          fit: [150, 150],
          align: 'right',
        });
        doc.fontSize(8).font('Helvetica-Oblique');
        doc.text('QR Code de vérification', doc.page.width - 200, doc.page.height - 50, {
          align: 'right',
        });

        // Pied de page
        doc.fontSize(8).font('Helvetica');
        doc.text(
          `Document généré le ${new Date().toLocaleString('fr-FR')} - ID Restitution: ${returnDoc._id}`,
          { align: 'center' },
        );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Générer un QR code pour un document
   */
  private async generateQRCode(id: string, type: 'allocation' | 'return'): Promise<string> {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const qrData = `${baseUrl}/verify/${type}/${id}`;
    return qrData;
  }

  /**
   * Obtenir le label d'état du matériel
   */
  private getConditionLabel(condition: string): string {
    const labels: Record<string, string> = {
      bon_etat: 'Bon état',
      degrade: 'Dégradé',
      endommage: 'Endommagé',
      manquant: 'Manquant',
      detruit: 'Détruit',
    };
    return labels[condition] || condition;
  }

  /**
   * Obtenir le bucket GridFS
   */
  private getGridFSBucket(): GridFSBucket {
    const db = this.connection.db;
    if (!db) {
      throw new Error('MongoDB database connection is not available');
    }
    return new GridFSBucket(db, { bucketName: 'documents' });
  }

  /**
   * Récupérer un PDF depuis GridFS
   */
  async getPDF(documentId: string): Promise<{ stream: NodeJS.ReadableStream; filename: string; size: number }> {
    const document = await this.documentModel.findById(documentId).exec();
    if (!document) {
      throw new NotFoundException(`Document avec l'ID ${documentId} non trouvé`);
    }

    const bucket = this.getGridFSBucket();
    const stream = bucket.openDownloadStream(document.fileId);

    return {
      stream,
      filename: document.filename,
      size: document.fileSize,
    };
  }
}

