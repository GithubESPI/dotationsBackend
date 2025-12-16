import { PartialType } from '@nestjs/swagger';
import { CreateAllocationDto } from './create-allocation.dto';

export class UpdateAllocationDto extends PartialType(CreateAllocationDto) {}

