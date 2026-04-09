import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { GridFSBucket } from 'mongodb';
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
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
  ) { }

  /**
   * Générer le PDF de dotation et le stocker dans GridFS
   */
  async generateAllocationPDF(allocationId: string): Promise<DocumentDocument> {
    // Récupérer l'allocation avec toutes les données nécessaires
    const allocation = await this.connection
      .model<AllocationDocument>('Allocation')
      .findById(allocationId)
      .populate('userId', 'displayName email department officeLocation documents') // Populate documents
      .populate('equipments.equipmentId', 'brand model serialNumber type internalId jiraAssetId')
      .exec();

    if (!allocation) {
      throw new NotFoundException(`Allocation avec l'ID ${allocationId} non trouvée`);
    }

    // Vérifier si un document existe déjà pour cette allocation
    if (allocation.documentId) {
      const existingDoc = await this.documentModel.findById(allocation.documentId).exec();
      if (existingDoc) {
        this.logger.log(`ℹ️ Document déjà existant pour l'allocation ${allocationId}. Réutilisation.`);
        return existingDoc;
      }
    }

    const user = allocation.userId as any as UserDocument;
    if (!user) {
      throw new NotFoundException('Utilisateur associé à l\'allocation non trouvé');
    }

    // Générer le PDF
    const pdfBuffer = await this.createAllocationPDFBuffer(allocation, user);

    // Upload vers Azure
    const filename = `dotation_${allocation._id}_${Date.now()}.pdf`;
    let storageUrl = '';
    let storageType = 'gridfs';
    let fileId: Types.ObjectId = new Types.ObjectId(); // Dummy ID for Azure, or real for GridFS

    try {
      storageUrl = await this.uploadToAzure(pdfBuffer, filename);
      storageType = 'azure';
      this.logger.log(`☁️ PDF uploadé sur Azure: ${storageUrl}`);
    } catch (e) {
      this.logger.warn(`⚠️ Échec upload Azure, fallback GridFS: ${e.message}`);
      // Fallback GridFS (Optional implementation, skipping for now to rely on Azure as requested)
      // If critical, implement fallback here. Assuming Azure is primary.
    }

    // Créer le document
    const equipmentsList = allocation.equipments.map(
      eq => `${(eq.equipmentId as any)?.brand || 'N/A'} ${(eq.equipmentId as any)?.model || 'N/A'} - ${(eq.equipmentId as any)?.serialNumber || 'N/A'}`,
    );
    const qrCodeData = await this.generateQRCode(allocation._id.toString(), 'allocation');

    const document = new this.documentModel({
      documentType: DocumentType.DOTATION,
      allocationId: allocation._id,
      fileId: fileId, // Keep fileId for compatibility or dummy
      filename,
      mimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      storageUrl,
      storageType,
      metadata: {
        userName: user.displayName || user.email,
        equipmentsList,
        charterVersion: this.CHARTE_VERSION,
        qrCode: qrCodeData,
      },
      status: DocumentStatus.PENDING,
    });

    const savedDoc = await document.save();

    // Mettre à jour l'allocation
    await this.connection
      .model<AllocationDocument>('Allocation')
      .findByIdAndUpdate(allocationId, { documentId: savedDoc._id })
      .exec();

    // Mettre à jour le profil utilisateur (Historique) - Idempotence: vérifier si déjà présent
    const alreadyExists = user.documents?.some(d => 
      d.url === storageUrl || (d.type === 'dotation' && d.url.includes(allocationId.toString()))
    );

    if (!alreadyExists) {
      await this.connection.model('User').findByIdAndUpdate(user._id, {
        $push: {
          documents: {
            type: 'dotation',
            url: storageUrl,
            name: filename,
            createdAt: new Date()
          }
        }
      });
    } else {
      this.logger.log(`ℹ️ Document déjà présent dans le profil de l'utilisateur ${user.email}. Pas de doublon ajouté.`);
    }

    return savedDoc;
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
      .populate('userId', 'displayName email department officeLocation documents')
      .populate('equipmentsReturned.equipmentId', 'brand model serialNumber type internalId')
      .exec();

    if (!returnDoc) {
      throw new NotFoundException(`Restitution avec l'ID ${returnId} non trouvée`);
    }

    // Vérifier si un document existe déjà pour cette restitution
    if (returnDoc.returnDocumentId) {
      const existingDoc = await this.documentModel.findById(returnDoc.returnDocumentId).exec();
      if (existingDoc) {
        this.logger.log(`ℹ️ Document déjà existant pour la restitution ${returnId}. Réutilisation.`);
        return existingDoc;
      }
    }

    const user = returnDoc.userId as any as UserDocument;
    if (!user) {
      throw new NotFoundException('Utilisateur associé à la restitution non trouvé');
    }

    // Générer le PDF
    const pdfBuffer = await this.createReturnPDFBuffer(returnDoc, user);

    // Upload vers Azure
    const filename = `restitution_${returnDoc._id}_${Date.now()}.pdf`;
    let storageUrl = '';
    let storageType = 'gridfs';
    let fileId: Types.ObjectId = new Types.ObjectId();

    try {
      storageUrl = await this.uploadToAzure(pdfBuffer, filename);
      storageType = 'azure';
      this.logger.log(`☁️ PDF Restitution uploadé sur Azure: ${storageUrl}`);
    } catch (e) {
      this.logger.warn(`⚠️ Échec upload Azure, fallback GridFS: ${e.message}`);
    }

    // Créer le document
    const equipmentsList = returnDoc.equipmentsReturned.map(
      eq => `${(eq.equipmentId as any)?.brand || 'N/A'} ${(eq.equipmentId as any)?.model || 'N/A'} - ${(eq.equipmentId as any)?.serialNumber || 'N/A'}`,
    );
    const qrCodeData = await this.generateQRCode(returnDoc._id.toString(), 'return');

    const document = new this.documentModel({
      documentType: DocumentType.RESTITUTION,
      returnId: returnDoc._id,
      fileId: fileId,
      filename,
      mimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      storageUrl,
      storageType,
      metadata: {
        userName: user.displayName || user.email,
        equipmentsList,
        charterVersion: this.CHARTE_VERSION,
        qrCode: qrCodeData,
      },
      status: returnDoc.completedAt ? DocumentStatus.SIGNED : DocumentStatus.PENDING,
    });

    const savedDoc = await document.save();

    // Mettre à jour la restitution
    await this.connection
      .model<ReturnDocument>('Return')
      .findByIdAndUpdate(returnId, { returnDocumentId: savedDoc._id })
      .exec();

    // Mettre à jour le profil utilisateur (Historique) - Idempotence: vérifier si déjà présent
    const alreadyExists = user.documents?.some(d => 
      d.url === storageUrl || (d.type === 'restitution' && d.url.includes(returnId.toString()))
    );

    if (!alreadyExists) {
      await this.connection.model('User').findByIdAndUpdate(user._id, {
        $push: {
          documents: {
            type: 'restitution',
            url: storageUrl,
            name: filename,
            createdAt: new Date()
          }
        }
      });
    } else {
      this.logger.log(`ℹ️ Document de restitution déjà présent dans le profil de l'utilisateur ${user.email}. Pas de doublon ajouté.`);
    }

    return savedDoc;
  }

  /**
   * Uploader un buffer vers Azure Storage
   */
  private async uploadToAzure(buffer: Buffer, filename: string): Promise<string> {
    try {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING missing');

      const containerName = 'dotationdoc';
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);

      await containerClient.createIfNotExists();

      const blockBlobClient = containerClient.getBlockBlobClient(filename);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' }
      });

      return blockBlobClient.url;
    } catch (error: any) {
      this.logger.error(`❌ Azure Upload Error: ${error.message}`);
      throw error;
    }
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
        if ((allocation as any).signatureData?.signatureImage) {
          const rawSig = (allocation as any).signatureData.signatureImage.replace(/^data:image\/\w+;base64,/, '');
          const sigImage = Buffer.from(rawSig, 'base64');
          doc.image(sigImage, 50, doc.y, { fit: [150, 50] });
          doc.moveDown(1);
        } else {
          doc.moveDown(2);
          doc.text('_________________________', { align: 'left' });
        }
        doc.text(`${user.displayName || user.email}`, { align: 'left' });
        doc.text(
          `Date: ${(allocation as any).signatureData?.timestamp ? new Date((allocation as any).signatureData.timestamp).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}`,
          { align: 'left' },
        );

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
    return new GridFSBucket(db as any, { bucketName: 'documents' });
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

  /**
   * Générer une URL signée (SAS) pour un blob Azure
   */
  getSasUrl(blobUrl: string): string {
    try {
      if (!blobUrl || !blobUrl.includes('dotation.blob.core.windows.net')) {
        return blobUrl;
      }

      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!connectionString) return blobUrl;

      // Extraire le nom du conteneur et du blob depuis l'URL
      // URL format: https://<account>.blob.core.windows.net/<container>/<blob>
      const url = new URL(blobUrl);
      const pathParts = url.pathname.split('/').filter(p => p);
      if (pathParts.length < 2) return blobUrl;

      const containerName = pathParts[0];
      const blobName = pathParts.slice(1).join('/');

      // Extraire account name et key de la connection string
      const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
      const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);

      if (!accountNameMatch || !accountKeyMatch) return blobUrl;

      const accountName = accountNameMatch[1];
      const accountKey = accountKeyMatch[1];

      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

      const sasOptions = {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'), // Read only
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 heure
      };

      const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();

      return `${blobUrl}?${sasToken}`;
    } catch (error) {
      this.logger.error(`Erreur génération SAS token: ${error.message}`);
      return blobUrl;
    }
  }
}

