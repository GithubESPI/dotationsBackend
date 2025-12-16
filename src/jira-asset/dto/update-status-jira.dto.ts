import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEquipmentStatusInJiraDto {
  @ApiProperty({ description: 'ID de l\'attribut statut dans Jira' })
  @IsString()
  @IsNotEmpty()
  statusAttrId: string;

  @ApiPropertyOptional({ description: 'ID de l\'attribut utilisateur affecté dans Jira' })
  @IsOptional()
  @IsString()
  assignedUserAttrId?: string;
}

