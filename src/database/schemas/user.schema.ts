import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  office365Id: string; // UPN (User Principal Name)

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  displayName: string;

  @Prop()
  givenName?: string;

  @Prop()
  surname?: string;

  @Prop()
  jobTitle?: string;

  @Prop()
  department?: string;

  @Prop()
  officeLocation?: string;

  @Prop()
  mobilePhone?: string;

  @Prop()
  officePhone?: string; // Téléphone professionnel

  @Prop()
  businessPhones?: string[]; // Liste des téléphones professionnels

  @Prop()
  city?: string; // Ville

  @Prop()
  country?: string; // Pays

  @Prop()
  postalCode?: string; // Code postal

  @Prop()
  streetAddress?: string; // Adresse

  @Prop()
  state?: string; // État/Région

  @Prop()
  companyName?: string; // Nom de l'entreprise

  @Prop()
  employeeId?: string; // ID employé

  @Prop()
  employeeType?: string; // Type d'employé (Employee, Contractor, etc.)

  @Prop()
  employeeHireDate?: Date; // Date d'embauche

  @Prop()
  managerId?: string; // ID du manager (office365Id)

  @Prop()
  managerDisplayName?: string; // Nom du manager

  @Prop()
  managerEmail?: string; // Email du manager

  @Prop()
  officeName?: string; // Nom du bureau

  @Prop()
  division?: string; // Division

  @Prop()
  costCenter?: string; // Centre de coût

  @Prop({ type: MongooseSchema.Types.Mixed })
  employeeOrgData?: {
    costCenter?: string;
    division?: string;
  }; // Données d'organisation de l'employé

  @Prop({ type: MongooseSchema.Types.Mixed })
  onPremisesExtensionAttributes?: {
    extensionAttribute1?: string;
    extensionAttribute2?: string;
    extensionAttribute3?: string;
    extensionAttribute4?: string;
    extensionAttribute5?: string;
    extensionAttribute6?: string;
    extensionAttribute7?: string;
    extensionAttribute8?: string;
    extensionAttribute9?: string;
    extensionAttribute10?: string;
    extensionAttribute11?: string;
    extensionAttribute12?: string;
    extensionAttribute13?: string;
    extensionAttribute14?: string;
    extensionAttribute15?: string;
  }; // Attributs d'extension personnalisés

  @Prop()
  businessUnit?: string; // Unité commerciale

  @Prop()
  employeeNumber?: string; // Numéro d'employé (alternative à employeeId)

  @Prop()
  preferredLanguage?: string; // Langue préférée

  @Prop()
  usageLocation?: string; // Localisation d'utilisation

  @Prop()
  userType?: string; // Type d'utilisateur (Member, Guest)

  @Prop()
  accountEnabled?: boolean; // Compte activé dans Azure AD

  @Prop({ default: true })
  isActive: boolean; // Actif dans notre système

  @Prop()
  profilePicture?: string; // Photo de profil en base64 ou URL

  @Prop()
  profilePictureUrl?: string; // URL de la photo de profil depuis Graph API

  @Prop()
  lastSync?: Date; // Dernière synchronisation

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Index pour améliorer les performances de recherche
UserSchema.index({ email: 1 });
UserSchema.index({ office365Id: 1 });
UserSchema.index({ isActive: 1 });

