import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DocumentDocument = DocumentModel & Document;

export enum DocumentType {
  DOTATION = 'dotation',
  RESTITUTION = 'restitution',
}

export enum DocumentStatus {
  PENDING = 'pending',
  SIGNED = 'signed',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

@Schema({ timestamps: true })
export class Signature {
  @Prop({ required: true })
  signerRole: string; // employee, rh, it

  @Prop({ required: true })
  signedAt: Date;

  @Prop({ required: true })
  signatureData: string; // Base64 image
}

const SignatureSchema = SchemaFactory.createForClass(Signature);

@Schema({ timestamps: true })
export class DocumentModel {
  @Prop({ required: true, enum: DocumentType })
  documentType: DocumentType;

  @Prop({ type: Types.ObjectId, ref: 'Allocation', index: true })
  allocationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Return', index: true })
  returnId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  fileId: Types.ObjectId; // GridFS file ID

  @Prop({ required: true })
  filename: string;

  @Prop({ default: 'application/pdf' })
  mimeType: string;

  @Prop({ required: true })
  fileSize: number;

  @Prop({
    type: {
      userName: String,
      equipmentsList: [String],
      charterVersion: String,
      qrCode: String,
    },
  })
  metadata?: {
    userName: string;
    equipmentsList: string[];
    charterVersion: string;
    qrCode: string;
  };

  @Prop({ type: [SignatureSchema], default: [] })
  signatures: Signature[];

  @Prop({ default: DocumentStatus.PENDING, enum: DocumentStatus, index: true })
  status: DocumentStatus;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentModel);

// Index pour améliorer les performances
DocumentSchema.index({ allocationId: 1 });
DocumentSchema.index({ returnId: 1 });
DocumentSchema.index({ status: 1 });
DocumentSchema.index({ documentType: 1 });
DocumentSchema.index({ createdAt: -1 });

