import { IsString, IsOptional, IsEnum, IsInt, Min, Max, IsMongoId } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AllocationStatus } from '../../database/schemas/allocation.schema';

export class SearchAllocationDto {
  @ApiPropertyOptional({ description: 'Recherche par nom utilisateur ou email' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: 'Filtrer par ID utilisateur' })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: AllocationStatus })
  @IsOptional()
  @IsEnum(AllocationStatus)
  status?: AllocationStatus;

  @ApiPropertyOptional({ description: 'Filtrer par date de dotation (début)', example: '2025-01-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filtrer par date de dotation (fin)', example: '2025-12-31' })
  @IsOptional()
  @IsString()
  endDate?: string;

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

