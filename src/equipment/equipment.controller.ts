import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { EquipmentService } from './equipment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { SearchEquipmentDto } from './dto/search-equipment.dto';

@ApiTags('Equipment')
@Controller('equipment')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau matériel' })
  @ApiResponse({
    status: 201,
    description: 'Matériel créé avec succès',
  })
  @ApiResponse({ status: 400, description: 'Numéro de série déjà existant' })
  async create(@Body() createDto: CreateEquipmentDto) {
    return this.equipmentService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Rechercher des matériels avec filtres et pagination' })
  @ApiResponse({
    status: 200,
    description: 'Liste des matériels avec pagination',
  })
  async search(@Query() searchDto: SearchEquipmentDto) {
    return this.equipmentService.search(searchDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtenir tous les matériels' })
  @ApiResponse({
    status: 200,
    description: 'Liste de tous les matériels',
  })
  async findAll() {
    return this.equipmentService.findAll();
  }

  @Get('available')
  @ApiOperation({ summary: 'Obtenir les matériels disponibles (non affectés)' })
  @ApiResponse({
    status: 200,
    description: 'Liste des matériels disponibles',
  })
  async findAvailable() {
    return this.equipmentService.findAvailable();
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtenir les matériels affectés à un utilisateur' })
  @ApiParam({ name: 'userId', description: 'ID MongoDB de l\'utilisateur' })
  @ApiResponse({
    status: 200,
    description: 'Liste des matériels de l\'utilisateur',
  })
  async findByUserId(@Param('userId') userId: string) {
    return this.equipmentService.findByUserId(userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtenir les statistiques des matériels' })
  @ApiResponse({
    status: 200,
    description: 'Statistiques des matériels',
  })
  async getStats() {
    return this.equipmentService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un matériel par son ID' })
  @ApiParam({ name: 'id', description: 'ID MongoDB du matériel' })
  @ApiResponse({
    status: 200,
    description: 'Matériel trouvé',
  })
  @ApiResponse({ status: 404, description: 'Matériel non trouvé' })
  async findOne(@Param('id') id: string) {
    return this.equipmentService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un matériel' })
  @ApiParam({ name: 'id', description: 'ID MongoDB du matériel' })
  @ApiResponse({
    status: 200,
    description: 'Matériel mis à jour',
  })
  @ApiResponse({ status: 404, description: 'Matériel non trouvé' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateEquipmentDto) {
    return this.equipmentService.update(id, updateDto);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Affecter un matériel à un utilisateur' })
  @ApiParam({ name: 'id', description: 'ID MongoDB du matériel' })
  @ApiResponse({
    status: 200,
    description: 'Matériel affecté avec succès',
  })
  @ApiResponse({ status: 400, description: 'Matériel non disponible ou déjà affecté' })
  async assignToUser(
    @Param('id') id: string,
    @Body() body: { userId: string },
  ) {
    return this.equipmentService.assignToUser(id, body.userId);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Libérer un matériel (le rendre disponible)' })
  @ApiParam({ name: 'id', description: 'ID MongoDB du matériel' })
  @ApiResponse({
    status: 200,
    description: 'Matériel libéré avec succès',
  })
  async release(@Param('id') id: string) {
    return this.equipmentService.release(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un matériel' })
  @ApiParam({ name: 'id', description: 'ID MongoDB du matériel' })
  @ApiResponse({
    status: 204,
    description: 'Matériel supprimé',
  })
  @ApiResponse({ status: 400, description: 'Impossible de supprimer un matériel affecté' })
  async remove(@Param('id') id: string) {
    await this.equipmentService.remove(id);
  }
}

