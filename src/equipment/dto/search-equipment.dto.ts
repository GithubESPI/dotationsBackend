import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EquipmentType, EquipmentStatus } from '../../database/schemas/equipment.schema';

export class SearchEquipmentDto {
  @ApiPropertyOptional({ description: 'Recherche par marque, modèle, N° série ou N° interne' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: 'Filtrer par type de matériel', enum: EquipmentType })
  @IsOptional()
  @IsEnum(EquipmentType)
  type?: EquipmentType;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: EquipmentStatus })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @ApiPropertyOptional({ description: 'Filtrer par marque' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Filtrer par localisation' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Filtrer par utilisateur actuel (ID MongoDB)' })
  @IsOptional()
  @IsString()
  currentUserId?: string;

  @ApiPropertyOptional({ description: 'Numéro de page', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Nombre d\'éléments par page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

