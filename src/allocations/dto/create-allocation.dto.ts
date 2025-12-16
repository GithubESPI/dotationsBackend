import { IsString, IsArray, IsDateString, IsOptional, IsMongoId, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EquipmentItemDto {
  @ApiProperty({ description: 'ID MongoDB du matériel' })
  @IsMongoId()
  equipmentId: string;

  @ApiPropertyOptional({ description: 'N° interne' })
  @IsOptional()
  @IsString()
  internalId?: string;

  @ApiPropertyOptional({ description: 'Type de matériel' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'N° de série' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Date de livraison' })
  @IsOptional()
  @IsDateString()
  deliveredDate?: string;

  @ApiPropertyOptional({ description: 'État du matériel', default: 'bon_etat' })
  @IsOptional()
  @IsString()
  condition?: string;
}

export class CreateAllocationDto {
  @ApiProperty({ description: 'ID MongoDB de l\'utilisateur' })
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ 
    description: 'Liste des matériels à doter',
    type: [EquipmentItemDto],
    minItems: 1,
  })
  @IsArray()
  @IsNotEmpty()
  equipments: EquipmentItemDto[];

  @ApiProperty({ description: 'Date de dotation', default: 'date du jour' })
  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional({ description: 'Accessoires', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessories?: string[];

  @ApiPropertyOptional({ description: 'Logiciels supplémentaires', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalSoftware?: string[];

  @ApiPropertyOptional({ description: 'Services (SharePoint, Teams, etc.)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @ApiPropertyOptional({ description: 'Notes supplémentaires' })
  @IsOptional()
  @IsString()
  notes?: string;
}

