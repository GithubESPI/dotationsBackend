import { IsString, IsEmail, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiProperty({ description: 'ID Office 365 (UPN)' })
  @IsString()
  office365Id: string;

  @ApiProperty({ description: 'Email professionnel' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Nom complet' })
  @IsString()
  displayName: string;

  @ApiPropertyOptional({ description: 'Prénom' })
  @IsOptional()
  @IsString()
  givenName?: string;

  @ApiPropertyOptional({ description: 'Nom de famille' })
  @IsOptional()
  @IsString()
  surname?: string;

  @ApiPropertyOptional({ description: 'Poste' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Département' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Localisation' })
  @IsOptional()
  @IsString()
  officeLocation?: string;

  @ApiPropertyOptional({ description: 'Téléphone mobile' })
  @IsOptional()
  @IsString()
  mobilePhone?: string;

  @ApiPropertyOptional({ description: 'URL de la photo de profil' })
  @IsOptional()
  @IsString()
  profilePicture?: string;

  @ApiPropertyOptional({ description: 'Statut actif', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

