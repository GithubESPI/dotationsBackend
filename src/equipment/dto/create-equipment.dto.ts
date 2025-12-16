import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EquipmentType, EquipmentStatus } from '../../database/schemas/equipment.schema';

export class CreateEquipmentDto {
  @ApiPropertyOptional({ description: 'ID de l\'asset dans Jira' })
  @IsOptional()
  @IsString()
  jiraAssetId?: string;

  @ApiPropertyOptional({ description: 'N° d\'inventaire interne' })
  @IsOptional()
  @IsString()
  internalId?: string;

  @ApiProperty({ 
    description: 'Type de matériel',
    enum: EquipmentType,
    example: EquipmentType.PC_PORTABLE,
  })
  @IsEnum(EquipmentType)
  type: EquipmentType;

  @ApiProperty({ description: 'Marque (ex: Dell, HP, Apple)', example: 'Dell' })
  @IsString()
  brand: string;

  @ApiProperty({ description: 'Modèle (ex: ThinkPad E14)', example: 'ThinkPad E14' })
  @IsString()
  model: string;

  @ApiProperty({ description: 'Numéro de série (unique)', example: 'SN123456789' })
  @IsString()
  serialNumber: string;

  @ApiPropertyOptional({ description: 'IMEI (pour les mobiles)' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ description: 'N° de ligne téléphonique' })
  @IsOptional()
  @IsString()
  phoneLine?: string;

  @ApiPropertyOptional({ 
    description: 'Statut du matériel',
    enum: EquipmentStatus,
    default: EquipmentStatus.DISPONIBLE,
  })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @ApiPropertyOptional({ description: 'ID de l\'utilisateur actuel si affecté' })
  @IsOptional()
  @IsMongoId()
  currentUserId?: string;

  @ApiPropertyOptional({ description: 'Localisation physique' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Logiciels supplémentaires installés', type: [String] })
  @IsOptional()
  additionalSoftwares?: string[];
}

