import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Allocation } from './allocation.schema';

export type ReturnDocument = Return & Document;

@Schema({ timestamps: true })
export class EquipmentReturned {
  @Prop({ type: Types.ObjectId, ref: 'Equipment', required: true })
  equipmentId: Types.ObjectId;

  @Prop()
  internalId?: string;

  @Prop()
  serialNumber?: string;

  @Prop({ required: true })
  returnDate: Date;

  @Prop({ required: true })
  condition: string; // bon_etat, degrade, endommage, manquant, detruit

  @Prop()
  notes?: string;

  @Prop({ type: [String], default: [] })
  photos?: string[]; // URLs des photos si nécessaire
}

const EquipmentReturnedSchema = SchemaFactory.createForClass(EquipmentReturned);

@Schema({ timestamps: true })
export class Return {
  @Prop({ type: Types.ObjectId, ref: 'Allocation', required: true, index: true })
  allocationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ type: [EquipmentReturnedSchema], required: true })
  equipmentsReturned: EquipmentReturned[];

  @Prop({ required: true, default: Date.now })
  returnDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'Document' })
  returnDocumentId?: Types.ObjectId; // Référence au PDF de restitution

  @Prop()
  signedAt?: Date;

  @Prop({
    type: {
      signerName: String,
      signatureImage: String, // Base64
      timestamp: Date,
    },
  })
  signatureDataEmployee?: {
    signerName: string;
    signatureImage: string;
    timestamp: Date;
  };

  @Prop({
    type: {
      signerName: String,
      signatureImage: String,
      timestamp: Date,
    },
  })
  signatureDataIT?: {
    signerName: string;
    signatureImage: string;
    timestamp: Date;
  };

  @Prop({
    type: {
      signerName: String,
      signatureImage: String,
      timestamp: Date,
    },
  })
  signatureDataHR?: {
    signerName: string;
    signatureImage: string;
    timestamp: Date;
  };

  @Prop({ type: [String], default: [] })
  removedSoftware: string[]; // Logiciels supprimés

  @Prop({ required: true })
  createdBy: string; // Responsable RH qui a créé la restitution

  @Prop({
    type: {
      validatedBy: String,
      validatedAt: Date,
      soldeToutCompte: { type: Boolean, default: false },
    },
  })
  rhValidation?: {
    validatedBy: string;
    validatedAt: Date;
    soldeToutCompte: boolean;
  };

  @Prop()
  completedAt?: Date;

  @Prop()
  createdAt?: Date;
}

export const ReturnSchema = SchemaFactory.createForClass(Return);

// Index pour améliorer les performances
ReturnSchema.index({ userId: 1 });
ReturnSchema.index({ allocationId: 1 });
ReturnSchema.index({ returnDate: 1 });
ReturnSchema.index({ 'rhValidation.soldeToutCompte': 1 });
ReturnSchema.index({ createdAt: -1 });

