import { IsString, IsOptional, IsInt, Min, Max, IsMongoId } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchReturnDto {
  @ApiPropertyOptional({ description: 'Recherche par nom utilisateur ou email' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: 'Filtrer par ID utilisateur' })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par ID allocation' })
  @IsOptional()
  @IsMongoId()
  allocationId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par date de restitution (début)', example: '2025-01-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filtrer par date de restitution (fin)', example: '2025-12-31' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filtrer par validation RH (solde de tout compte)' })
  @IsOptional()
  soldeToutCompte?: boolean;

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

