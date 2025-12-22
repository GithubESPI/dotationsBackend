import {
  Controller,
  Post,
  Get,
  Body,
  Param,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JiraAssetService } from './jira-asset.service';
import { SyncEquipmentFromJiraDto, SyncEquipmentToJiraDto, SyncAllFromJiraDto } from './dto/sync-equipment.dto';
import { UpdateEquipmentStatusInJiraDto } from './dto/update-status-jira.dto';

@ApiTags('Jira Asset')
@Controller('jira-asset')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class JiraAssetController {
  constructor(private readonly jiraAssetService: JiraAssetService) {}

  @Get('workspace')
  @ApiOperation({ 
    summary: 'Obtenir l\'ID du workspace Jira Asset',
    description: 'Récupère l\'ID du workspace Jira Asset configuré',
  })
  @ApiResponse({
    status: 200,
    description: 'Workspace ID récupéré avec succès',
  })
  async getWorkspaceId() {
    const workspaceId = await this.jiraAssetService.getWorkspaceId();
    return { workspaceId };
  }

  @Post('sync/from-jira')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Synchroniser un équipement depuis Jira vers MongoDB',
    description: 'Récupère un équipement depuis Jira Asset et le synchronise dans MongoDB',
  })
  @ApiResponse({
    status: 200,
    description: 'Équipement synchronisé avec succès',
  })
  @ApiResponse({ status: 400, description: 'Données invalides ou erreur de synchronisation' })
  @ApiResponse({ status: 404, description: 'Asset non trouvé dans Jira' })
  async syncEquipmentFromJira(@Body() dto: SyncEquipmentFromJiraDto) {
    return this.jiraAssetService.syncEquipmentFromJira(
      dto.jiraAssetId,
      dto.objectTypeId,
      {
        serialNumberAttrId: dto.serialNumberAttrId,
        brandAttrId: dto.brandAttrId,
        modelAttrId: dto.modelAttrId,
        typeAttrId: dto.typeAttrId,
        statusAttrId: dto.statusAttrId,
        internalIdAttrId: dto.internalIdAttrId,
      },
    );
  }

  @Post('sync/to-jira')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Synchroniser un équipement depuis MongoDB vers Jira',
    description: 'Envoie un équipement depuis MongoDB vers Jira Asset (création ou mise à jour)',
  })
  @ApiResponse({
    status: 200,
    description: 'Équipement synchronisé vers Jira avec succès',
  })
  @ApiResponse({ status: 400, description: 'Données invalides ou erreur de synchronisation' })
  @ApiResponse({ status: 404, description: 'Équipement non trouvé' })
  async syncEquipmentToJira(@Body() dto: SyncEquipmentToJiraDto) {
    return this.jiraAssetService.syncEquipmentToJira(
      dto.equipmentId,
      dto.objectTypeId,
      {
        serialNumberAttrId: dto.serialNumberAttrId,
        brandAttrId: dto.brandAttrId,
        modelAttrId: dto.modelAttrId,
        typeAttrId: dto.typeAttrId,
        statusAttrId: dto.statusAttrId,
        internalIdAttrId: dto.internalIdAttrId,
      },
    );
  }

  @Post('sync/all-from-jira')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Synchroniser tous les équipements depuis Jira',
    description: 'Synchronise tous les équipements d\'un type d\'objet depuis Jira Asset vers MongoDB',
  })
  @ApiResponse({
    status: 200,
    description: 'Synchronisation terminée',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number' },
        updated: { type: 'number' },
        errors: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Erreur de synchronisation' })
  async syncAllFromJira(@Body() dto: SyncAllFromJiraDto) {
    return this.jiraAssetService.syncAllFromJira(dto.objectTypeId, {
      serialNumberAttrId: dto.serialNumberAttrId,
      brandAttrId: dto.brandAttrId,
      modelAttrId: dto.modelAttrId,
      typeAttrId: dto.typeAttrId,
      statusAttrId: dto.statusAttrId,
      internalIdAttrId: dto.internalIdAttrId,
    });
  }

  @Get('asset/:assetId')
  @ApiOperation({ 
    summary: 'Récupérer un asset depuis Jira',
    description: 'Récupère les détails d\'un asset depuis Jira Asset par son ID',
  })
  @ApiParam({ name: 'assetId', description: 'ID de l\'asset dans Jira' })
  @ApiResponse({
    status: 200,
    description: 'Asset récupéré avec succès',
  })
  @ApiResponse({ status: 404, description: 'Asset non trouvé' })
  async getAssetFromJira(@Param('assetId') assetId: string) {
    return this.jiraAssetService.getAssetFromJira(assetId);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Rechercher des assets dans Jira',
    description: 'Recherche des assets dans Jira Asset selon un type d\'objet et une requête optionnelle',
  })
  @ApiResponse({
    status: 200,
    description: 'Recherche terminée',
  })
  async searchAssets(
    @Body() body: { objectTypeId: string; query?: string; limit?: number },
  ) {
    return this.jiraAssetService.searchAssetsInJira(
      body.objectTypeId,
      body.query,
      body.limit || 50,
    );
  }

  @Post('equipment/:equipmentId/update-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Mettre à jour uniquement le statut et l\'utilisateur dans Jira',
    description: 'Méthode optimisée pour mettre à jour uniquement le statut et l\'utilisateur affecté dans Jira après une affectation/libération',
  })
  @ApiParam({ name: 'equipmentId', description: 'ID MongoDB de l\'équipement' })
  @ApiResponse({
    status: 200,
    description: 'Statut Jira mis à jour avec succès',
  })
  @ApiResponse({ status: 404, description: 'Équipement non trouvé' })
  async updateEquipmentStatusInJira(
    @Param('equipmentId') equipmentId: string,
    @Body() dto: UpdateEquipmentStatusInJiraDto,
  ) {
    await this.jiraAssetService.updateEquipmentStatusInJira(equipmentId, {
      statusAttrId: dto.statusAttrId,
      assignedUserAttrId: dto.assignedUserAttrId,
    });
    return { message: 'Statut Jira mis à jour avec succès' };
  }

  @Get('schema/:schemaName')
  @ApiOperation({ 
    summary: 'Récupérer tous les objets d\'un schéma',
    description: 'Récupère tous les objets d\'un schéma spécifique (ex: "Parc Informatique") via l\'API AQL',
  })
  @ApiParam({ name: 'schemaName', description: 'Nom du schéma (ex: "Parc Informatique")' })
  @ApiResponse({
    status: 200,
    description: 'Objets récupérés avec succès',
  })
  async getAllAssetsFromSchema(@Param('schemaName') schemaName: string) {
    const assets = await this.jiraAssetService.getAllAssetsFromSchema(schemaName);
    return {
      schemaName,
      count: assets.length,
      assets,
    };
  }

  @Get('schema/:schemaName/object-type/:objectTypeName')
  @ApiOperation({ 
    summary: 'Récupérer tous les objets d\'un type d\'objet spécifique dans un schéma',
    description: 'Récupère tous les objets et attributs d\'un catalogue spécifique (ex: "Laptop") dans un schéma (ex: "Parc Informatique")',
  })
  @ApiParam({ name: 'schemaName', description: 'Nom du schéma (ex: "Parc Informatique")' })
  @ApiParam({ name: 'objectTypeName', description: 'Nom du type d\'objet/catalogue (ex: "Laptop")' })
  @ApiResponse({
    status: 200,
    description: 'Objets récupérés avec succès',
  })
  @ApiResponse({ status: 400, description: 'Erreur lors de la récupération' })
  async getAllAssetsByObjectType(
    @Param('schemaName') schemaName: string,
    @Param('objectTypeName') objectTypeName: string,
  ) {
    const assets = await this.jiraAssetService.getAllAssetsByObjectType(schemaName, objectTypeName);
    return {
      schemaName,
      objectTypeName,
      count: assets.length,
      assets,
    };
  }

  @Post('sync/laptops')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Synchroniser automatiquement tous les Laptops depuis Jira vers MongoDB',
    description: 'Récupère tous les Laptops depuis Jira Asset, détecte automatiquement les attributs, et les synchronise vers MongoDB pour permettre l\'attribution aux employés. Méthode optimisée avec traitement par lots.',
  })
  @ApiResponse({
    status: 200,
    description: 'Synchronisation terminée',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number' },
        updated: { type: 'number' },
        skipped: { type: 'number' },
        errors: { type: 'number' },
        total: { type: 'number' },
        attributeMapping: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Erreur de synchronisation' })
  async syncLaptops(
    @Body() body?: {
      schemaName?: string;
      objectTypeName?: string;
      limit?: number;
      autoDetectAttributes?: boolean;
      attributeMapping?: {
        serialNumberAttrId?: string;
        brandAttrId?: string;
        modelAttrId?: string;
        typeAttrId?: string;
        statusAttrId?: string;
        internalIdAttrId?: string;
        assignedUserAttrId?: string;
      };
    },
  ) {
    return this.jiraAssetService.syncLaptopsFromJira(
      body?.schemaName || 'Parc Informatique',
      body?.objectTypeName || 'Laptop',
      {
        limit: body?.limit || 1000,
        autoDetectAttributes: body?.autoDetectAttributes !== false,
        attributeMapping: body?.attributeMapping,
      },
    );
  }

  @Post('sync/schema/:schemaName')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Synchroniser tous les équipements d\'un schéma depuis Jira',
    description: 'Récupère tous les objets du schéma "Parc Informatique" et les synchronise automatiquement vers MongoDB',
  })
  @ApiParam({ name: 'schemaName', description: 'Nom du schéma (ex: "Parc Informatique")' })
  @ApiResponse({
    status: 200,
    description: 'Synchronisation terminée',
    schema: {
      type: 'object',
      properties: {
        created: { type: 'number' },
        updated: { type: 'number' },
        errors: { type: 'number' },
        skipped: { type: 'number' },
      },
    },
  })
  async syncAllFromSchema(
    @Param('schemaName') schemaName: string,
    @Body() dto: SyncAllFromJiraDto,
  ) {
    return this.jiraAssetService.syncAllFromSchema(schemaName, {
      serialNumberAttrId: dto.serialNumberAttrId,
      brandAttrId: dto.brandAttrId,
      modelAttrId: dto.modelAttrId,
      typeAttrId: dto.typeAttrId,
      statusAttrId: dto.statusAttrId,
      internalIdAttrId: dto.internalIdAttrId,
      assignedUserAttrId: dto.assignedUserAttrId,
    });
  }
}

