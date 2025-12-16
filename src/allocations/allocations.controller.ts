import {
  Controller,
  Get,
  Post,
  Put,
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
import { AllocationsService } from './allocations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserPayload } from '../auth/auth.service';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';
import { SearchAllocationDto } from './dto/search-allocation.dto';
import { SignAllocationDto } from './dto/sign-allocation.dto';

@ApiTags('Allocations')
@Controller('allocations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AllocationsController {
  constructor(private readonly allocationsService: AllocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle allocation (dotation)' })
  @ApiResponse({
    status: 201,
    description: 'Allocation créée avec succès',
  })
  @ApiResponse({ status: 400, description: 'Matériels non disponibles ou utilisateur invalide' })
  @ApiResponse({ status: 404, description: 'Utilisateur ou matériel non trouvé' })
  async create(
    @Body() createDto: CreateAllocationDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.allocationsService.create(createDto, user.email || user.name);
  }

  @Get()
  @ApiOperation({ summary: 'Rechercher des allocations avec filtres et pagination' })
  @ApiResponse({
    status: 200,
    description: 'Liste des allocations avec pagination',
  })
  async search(@Query() searchDto: SearchAllocationDto) {
    return this.allocationsService.search(searchDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtenir toutes les allocations' })
  @ApiResponse({
    status: 200,
    description: 'Liste de toutes les allocations',
  })
  async findAll() {
    return this.allocationsService.findAll();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtenir les allocations d\'un utilisateur' })
  @ApiParam({ name: 'userId', description: 'ID MongoDB de l\'utilisateur' })
  @ApiResponse({
    status: 200,
    description: 'Liste des allocations de l\'utilisateur',
  })
  async findByUserId(@Param('userId') userId: string) {
    return this.allocationsService.findByUserId(userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtenir les statistiques des allocations' })
  @ApiResponse({
    status: 200,
    description: 'Statistiques des allocations',
  })
  async getStats() {
    return this.allocationsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une allocation par son ID' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de l\'allocation' })
  @ApiResponse({
    status: 200,
    description: 'Allocation trouvée',
  })
  @ApiResponse({ status: 404, description: 'Allocation non trouvée' })
  async findOne(@Param('id') id: string) {
    return this.allocationsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une allocation' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de l\'allocation' })
  @ApiResponse({
    status: 200,
    description: 'Allocation mise à jour',
  })
  @ApiResponse({ status: 400, description: 'Allocation déjà signée' })
  @ApiResponse({ status: 404, description: 'Allocation non trouvée' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateAllocationDto) {
    return this.allocationsService.update(id, updateDto);
  }

  @Post(':id/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Signer une allocation électroniquement' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de l\'allocation' })
  @ApiResponse({
    status: 200,
    description: 'Allocation signée avec succès',
  })
  @ApiResponse({ status: 400, description: 'Allocation déjà signée' })
  @ApiResponse({ status: 404, description: 'Allocation non trouvée' })
  async sign(
    @Param('id') id: string,
    @Body() signDto: SignAllocationDto,
  ) {
    return this.allocationsService.sign(id, signDto);
  }
}

