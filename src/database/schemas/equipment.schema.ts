import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentDocument = Equipment & Document;

export enum EquipmentType {
  PC_PORTABLE = 'PC_portable',
  PC_FIXE = 'PC_fixe',
  MOBILE = 'mobile',
  TELEPHONE_IP = 'telephone_ip',
  ECRAN = 'ecran',
  TABLETTE = 'tablette',
  AUTRE = 'autre',
}

export enum EquipmentStatus {
  EN_STOCK = 'en_stock',         // "En stock" dans Jira (remplace DISPONIBLE)
  AFFECTE = 'affecte',
  EN_REPARATION = 'en_reparation',
  RESTITUE = 'restitue',
  PERDU = 'perdu',
  DETRUIT = 'detruit',
}

@Schema({ timestamps: true, collection: 'equipment' })
export class Equipment {
  @Prop({ unique: true, sparse: true })
  jiraAssetId?: string; // ID de l'asset dans Jira

  @Prop()
  internalId?: string; // N° d'inventaire interne

  @Prop()
  objectTypeName?: string; // Nom du type d'objet Jira (ex: Laptop, Chromebook)

  @Prop({ default: false })
  isMissingSerialNumber?: boolean; // Vrai si l'asset Jira n'avait pas de N° de série

  @Prop({ required: true, enum: EquipmentType })
  type: EquipmentType;

  @Prop({ required: true })
  brand: string; // Marque (Dell, HP, Apple, etc.)

  @Prop({ required: true })
  model: string; // Modèle

  @Prop({ required: true, unique: true, index: true })
  serialNumber: string; // N° de série

  @Prop()
  imei?: string; // Pour les mobiles

  @Prop()
  phoneLine?: string; // N° de ligne téléphonique

  @Prop({ default: EquipmentStatus.EN_STOCK, enum: EquipmentStatus })
  status: EquipmentStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  currentUserId?: Types.ObjectId; // Utilisateur actuel si affecté

  @Prop()
  location?: string; // Localisation physique

  @Prop({ type: [String], default: [] })
  additionalSoftwares: string[]; // Logiciels supplémentaires installés

  @Prop()
  lastSync?: Date; // Dernière synchronisation avec Jira

  @Prop({ type: Object })
  jiraAttributes?: Record<string, any>; // Tous les attributs Jira (Nom -> Valeur)

  @Prop()
  lastSyncedAt?: Date; // Dernière synchronisation avec Jira (alias)

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const EquipmentSchema = SchemaFactory.createForClass(Equipment);

// Index pour améliorer les performances
EquipmentSchema.index({ status: 1 });
EquipmentSchema.index({ currentUserId: 1 });
EquipmentSchema.index({ type: 1 });
EquipmentSchema.index({ objectTypeName: 1 });

