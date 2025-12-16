import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignAllocationDto {
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

