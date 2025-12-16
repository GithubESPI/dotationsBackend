import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditDocument = Audit & Document;

export enum AuditAction {
  CREATE_ALLOCATION = 'create_allocation',
  SIGN_DOCUMENT = 'sign_document',
  RETURN_EQUIPMENT = 'return_equipment',
  UPDATE_ALLOCATION = 'update_allocation',
  DELETE_ALLOCATION = 'delete_allocation',
  SYNC_OFFICE365 = 'sync_office365',
  SYNC_JIRA = 'sync_jira',
}

@Schema({ timestamps: true })
export class Audit {
  @Prop({ required: true, enum: AuditAction, index: true })
  action: AuditAction;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Allocation', index: true })
  allocationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Return', index: true })
  returnId?: Types.ObjectId;

  @Prop({ required: true })
  performedBy: string; // Email ou nom de l'utilisateur qui a effectué l'action

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop({ type: Object })
  oldData?: Record<string, any>;

  @Prop({ type: Object })
  newData?: Record<string, any>;

  @Prop({ required: true, default: Date.now, index: true })
  timestamp: Date;
}

export const AuditSchema = SchemaFactory.createForClass(Audit);

// Index pour améliorer les performances
AuditSchema.index({ timestamp: -1 });
AuditSchema.index({ allocationId: 1 });
AuditSchema.index({ userId: 1 });
AuditSchema.index({ action: 1 });
AuditSchema.index({ performedBy: 1 });

