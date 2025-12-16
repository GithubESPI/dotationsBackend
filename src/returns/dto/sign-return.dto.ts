import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum SignerRole {
  EMPLOYEE = 'employee',
  IT = 'it',
  HR = 'rh',
}

export class SignReturnDto {
  @ApiProperty({ 
    description: 'Rôle du signataire',
    enum: SignerRole,
    example: SignerRole.EMPLOYEE,
  })
  @IsEnum(SignerRole)
  signerRole: SignerRole;

  @ApiProperty({ 
    description: 'Signature électronique en base64 (image PNG)',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
  })
  @IsString()
  @IsNotEmpty()
  signatureImage: string;

  @ApiProperty({ description: 'Nom du signataire' })
  @IsString()
  @IsNotEmpty()
  signerName: string;
}

