import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';
import { Equipment } from './equipment.schema';

export type AllocationDocument = Allocation & Document;

export enum AllocationStatus {
  EN_COURS = 'en_cours',
  TERMINEE = 'terminee',
  EN_RETARD = 'en_retard',
  ANNULEE = 'annulee',
}

@Schema({ timestamps: true })
export class EquipmentItem {
  @Prop({ type: Types.ObjectId, ref: 'Equipment', required: true })
  equipmentId: Types.ObjectId;

  @Prop()
  internalId?: string;

  @Prop()
  type?: string;

  @Prop()
  serialNumber?: string;

  @Prop()
  deliveredDate?: Date;

  @Prop({ default: 'bon_etat' })
  condition?: string; // neuf, bon_etat, usure_normale
}

const EquipmentItemSchema = SchemaFactory.createForClass(EquipmentItem);

@Schema({ timestamps: true })
export class Allocation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  userEmail: string;

  @Prop({ type: [EquipmentItemSchema], required: true })
  equipments: EquipmentItem[];

  @Prop({ type: Types.ObjectId, ref: 'Document' })
  documentId?: Types.ObjectId; // Référence au PDF archivé

  @Prop({ required: true, default: Date.now })
  deliveryDate: Date; // Date de dotation

  @Prop({ default: AllocationStatus.EN_COURS, enum: AllocationStatus, index: true })
  status: AllocationStatus;

  @Prop()
  signedAt?: Date; // Date de signature

  @Prop({
    type: {
      signerName: String,
      signatureImage: String, // Base64
      timestamp: Date,
    },
  })
  signatureData?: {
    signerName: string;
    signatureImage: string;
    timestamp: Date;
  };

  @Prop({ type: [String], default: [] })
  accessories: string[]; // Accessoires (étui, sacoche, etc.)

  @Prop({ type: [String], default: [] })
  additionalSoftware: string[]; // Logiciels supplémentaires

  @Prop({ type: [String], default: [] })
  standardSoftware: string[]; // Logiciels standards (auto-généré)

  @Prop({ type: [String], default: [] })
  services: string[]; // Services (SharePoint, Teams, etc.)

  @Prop()
  notes?: string;

  @Prop({ required: true })
  createdBy: string; // Responsable IT qui a créé la dotation

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const AllocationSchema = SchemaFactory.createForClass(Allocation);

// Index pour améliorer les performances
AllocationSchema.index({ userId: 1 });
AllocationSchema.index({ status: 1 });
AllocationSchema.index({ deliveryDate: 1 });
AllocationSchema.index({ createdAt: -1 });

