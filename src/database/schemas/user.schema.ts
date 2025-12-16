import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  profilePicture?: string; // URL de la photo de profil

  @Prop()
  lastSync?: Date;

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

