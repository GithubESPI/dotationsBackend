import { IsString, IsOptional, IsMongoId, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncEquipmentFromJiraDto {
  @ApiProperty({ description: 'ID de l\'asset dans Jira' })
  @IsString()
  @IsNotEmpty()
  jiraAssetId: string;

  @ApiProperty({ description: 'ID du type d\'objet dans Jira Asset' })
  @IsString()
  @IsNotEmpty()
  objectTypeId: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut numéro de série dans Jira' })
  @IsOptional()
  @IsString()
  serialNumberAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut marque dans Jira' })
  @IsOptional()
  @IsString()
  brandAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut modèle dans Jira' })
  @IsOptional()
  @IsString()
  modelAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut type dans Jira' })
  @IsOptional()
  @IsString()
  typeAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut statut dans Jira' })
  @IsOptional()
  @IsString()
  statusAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut numéro interne dans Jira' })
  @IsOptional()
  @IsString()
  internalIdAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut utilisateur affecté dans Jira' })
  @IsOptional()
  @IsString()
  assignedUserAttrId?: string;
}

export class SyncEquipmentToJiraDto {
  @ApiProperty({ description: 'ID MongoDB de l\'équipement' })
  @IsMongoId()
  @IsNotEmpty()
  equipmentId: string;

  @ApiProperty({ description: 'ID du type d\'objet dans Jira Asset' })
  @IsString()
  @IsNotEmpty()
  objectTypeId: string;

  @ApiProperty({ description: 'ID de l\'attribut numéro de série dans Jira' })
  @IsString()
  @IsNotEmpty()
  serialNumberAttrId: string;

  @ApiProperty({ description: 'ID de l\'attribut marque dans Jira' })
  @IsString()
  @IsNotEmpty()
  brandAttrId: string;

  @ApiProperty({ description: 'ID de l\'attribut modèle dans Jira' })
  @IsString()
  @IsNotEmpty()
  modelAttrId: string;

  @ApiProperty({ description: 'ID de l\'attribut type dans Jira' })
  @IsString()
  @IsNotEmpty()
  typeAttrId: string;

  @ApiProperty({ description: 'ID de l\'attribut statut dans Jira' })
  @IsString()
  @IsNotEmpty()
  statusAttrId: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut numéro interne dans Jira' })
  @IsOptional()
  @IsString()
  internalIdAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut utilisateur affecté dans Jira' })
  @IsOptional()
  @IsString()
  assignedUserAttrId?: string;
}

export class SyncAllFromJiraDto {
  @ApiProperty({ description: 'ID du type d\'objet dans Jira Asset' })
  @IsString()
  @IsNotEmpty()
  objectTypeId: string;

  @ApiProperty({ description: 'ID de l\'attribut numéro de série dans Jira' })
  @IsString()
  @IsNotEmpty()
  serialNumberAttrId: string;

  @ApiProperty({ description: 'ID de l\'attribut marque dans Jira' })
  @IsString()
  @IsNotEmpty()
  brandAttrId: string;

  @ApiProperty({ description: 'ID de l\'attribut modèle dans Jira' })
  @IsString()
  @IsNotEmpty()
  modelAttrId: string;

  @ApiProperty({ description: 'ID de l\'attribut type dans Jira' })
  @IsString()
  @IsNotEmpty()
  typeAttrId: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut statut dans Jira' })
  @IsOptional()
  @IsString()
  statusAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut numéro interne dans Jira' })
  @IsOptional()
  @IsString()
  internalIdAttrId?: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut utilisateur affecté dans Jira' })
  @IsOptional()
  @IsString()
  assignedUserAttrId?: string;
}

