import { IsString, IsArray, IsDateString, IsOptional, IsMongoId, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EquipmentReturnedDto {
  @ApiProperty({ description: 'ID MongoDB du matériel' })
  @IsMongoId()
  equipmentId: string;

  @ApiPropertyOptional({ description: 'N° interne' })
  @IsOptional()
  @IsString()
  internalId?: string;

  @ApiPropertyOptional({ description: 'N° de série' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiProperty({ 
    description: 'État du matériel',
    enum: ['bon_etat', 'degrade', 'endommage', 'manquant', 'detruit'],
    example: 'bon_etat',
  })
  @IsString()
  @IsNotEmpty()
  condition: string;

  @ApiPropertyOptional({ description: 'Notes sur l\'état du matériel' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Photos du matériel (URLs)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}

export class CreateReturnDto {
  @ApiProperty({ description: 'ID MongoDB de l\'allocation (dotation) à restituer' })
  @IsMongoId()
  @IsNotEmpty()
  allocationId: string;

  @ApiProperty({ 
    description: 'Liste des matériels à restituer',
    type: [EquipmentReturnedDto],
    minItems: 1,
  })
  @IsArray()
  @IsNotEmpty()
  equipmentsReturned: EquipmentReturnedDto[];

  @ApiProperty({ description: 'Date de restitution', default: 'date du jour' })
  @IsDateString()
  @IsOptional()
  returnDate?: string;

  @ApiPropertyOptional({ description: 'Logiciels supprimés', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removedSoftware?: string[];
}

