import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserPayload } from '../auth/auth.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { SearchReturnDto } from './dto/search-return.dto';
import { SignReturnDto } from './dto/sign-return.dto';

@ApiTags('Returns')
@Controller('returns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle restitution' })
  @ApiResponse({
    status: 201,
    description: 'Restitution créée avec succès',
  })
  @ApiResponse({ status: 400, description: 'Matériels invalides ou allocation non trouvée' })
  @ApiResponse({ status: 404, description: 'Allocation non trouvée' })
  async create(
    @Body() createDto: CreateReturnDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.returnsService.create(createDto, user.email || user.name);
  }

  @Get()
  @ApiOperation({ summary: 'Rechercher des restitutions avec filtres et pagination' })
  @ApiResponse({
    status: 200,
    description: 'Liste des restitutions avec pagination',
  })
  async search(@Query() searchDto: SearchReturnDto) {
    return this.returnsService.search(searchDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtenir toutes les restitutions' })
  @ApiResponse({
    status: 200,
    description: 'Liste de toutes les restitutions',
  })
  async findAll() {
    return this.returnsService.findAll();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtenir les restitutions d\'un utilisateur' })
  @ApiParam({ name: 'userId', description: 'ID MongoDB de l\'utilisateur' })
  @ApiResponse({
    status: 200,
    description: 'Liste des restitutions de l\'utilisateur',
  })
  async findByUserId(@Param('userId') userId: string) {
    return this.returnsService.findByUserId(userId);
  }

  @Get('allocation/:allocationId')
  @ApiOperation({ summary: 'Obtenir les restitutions d\'une allocation' })
  @ApiParam({ name: 'allocationId', description: 'ID MongoDB de l\'allocation' })
  @ApiResponse({
    status: 200,
    description: 'Liste des restitutions de l\'allocation',
  })
  async findByAllocationId(@Param('allocationId') allocationId: string) {
    return this.returnsService.findByAllocationId(allocationId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtenir les statistiques des restitutions' })
  @ApiResponse({
    status: 200,
    description: 'Statistiques des restitutions',
  })
  async getStats() {
    return this.returnsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une restitution par son ID' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de la restitution' })
  @ApiResponse({
    status: 200,
    description: 'Restitution trouvée',
  })
  @ApiResponse({ status: 404, description: 'Restitution non trouvée' })
  async findOne(@Param('id') id: string) {
    return this.returnsService.findOne(id);
  }

  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Signer une restitution électroniquement' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de la restitution' })
  @ApiResponse({
    status: 200,
    description: 'Restitution signée avec succès',
  })
  @ApiResponse({ status: 400, description: 'Déjà signée par ce rôle' })
  @ApiResponse({ status: 404, description: 'Restitution non trouvée' })
  async sign(
    @Param('id') id: string,
    @Body() signDto: SignReturnDto,
  ) {
    return this.returnsService.sign(id, signDto);
  }

  @Post(':id/validate-hr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Valider la restitution par la RH (solde de tout compte)',
    description: 'Valide la restitution et marque le solde de tout compte si nécessaire. Nécessite que toutes les signatures soient présentes.',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB de la restitution' })
  @ApiResponse({
    status: 200,
    description: 'Restitution validée par la RH',
  })
  @ApiResponse({ status: 400, description: 'Signatures manquantes' })
  @ApiResponse({ status: 404, description: 'Restitution non trouvée' })
  async validateByHR(
    @Param('id') id: string,
    @Body() body: { soldeToutCompte?: boolean },
    @CurrentUser() user: UserPayload,
  ) {
    return this.returnsService.validateByHR(
      id,
      user.email || user.name,
      body.soldeToutCompte || false,
    );
  }
}

