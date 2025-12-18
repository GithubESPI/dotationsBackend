import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Equipment, EquipmentDocument, EquipmentStatus } from '../database/schemas/equipment.schema';

interface JiraAssetWorkspace {
  workspaceId: string;
}

interface JiraAssetObject {
  id: string;
  objectTypeId: string;
  attributes: Array<{
    objectTypeAttributeId: string;
    objectAttributeValues: Array<{
      value: string | number | boolean;
    }>;
  }>;
}

export interface JiraAssetObjectResponse {
  id: string;
  objectKey: string;
  objectTypeId: string;
  attributes: Array<{
    objectTypeAttributeId: string;
    objectAttributeValues: Array<{
      value: string | number | boolean;
    }>;
  }>;
}

@Injectable()
export class JiraAssetService {
  private readonly logger = new Logger(JiraAssetService.name);
  private workspaceId: string | null = null;
  private readonly baseUrl: string;
  private readonly baseUrlAssets: string;
  private readonly basePathAssets: string;
  private readonly apiToken: string;
  private readonly apiTokenAssets: string;
  private readonly email: string;
  private readonly emailAssets: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(Equipment.name) private equipmentModel: Model<EquipmentDocument>,
  ) {
    // Variables pour l'API Jira classique (rétrocompatibilité)
    this.baseUrl = this.configService.get<string>('JIRA_BASE_URL') || '';
    this.apiToken = this.configService.get<string>('JIRA_API_TOKEN') || '';
    this.email = this.configService.get<string>('JIRA_EMAIL') || '';

    // Variables pour l'API Jira Assets (nouvelle configuration)
    this.baseUrlAssets = this.configService.get<string>('JIRA_BASE_URL_ASSETS') || this.baseUrl;
    this.basePathAssets = this.configService.get<string>('JIRA_BASE_PATH_ASSETS') || '';
    this.apiTokenAssets = this.configService.get<string>('JIRA_TOKEN_ASSETS') || this.apiToken;
    this.emailAssets = this.configService.get<string>('JIRA_EMAIL_ASSETS') || this.email;

    if (!this.baseUrlAssets || !this.apiTokenAssets || !this.emailAssets) {
      this.logger.warn('⚠️ Configuration Jira Asset incomplète. Vérifiez JIRA_BASE_URL_ASSETS, JIRA_TOKEN_ASSETS et JIRA_EMAIL_ASSETS dans .env');
    }
  }

  /**
   * Construire l'URL complète pour l'API Jira Assets
   */
  private buildAssetsUrl(endpoint: string): string {
    const baseUrl = this.baseUrlAssets.replace(/\/$/, ''); // Enlever le slash final
    if (this.basePathAssets) {
      // Si JIRA_BASE_PATH_ASSETS est fourni, l'utiliser directement
      const basePath = this.basePathAssets.replace(/^\/+/, '').replace(/\/+$/, '');
      const endpointPath = endpoint.replace(/^\/+/, '');
      return `${baseUrl}/${basePath}/${endpointPath}`.replace(/\/+/g, '/').replace(/https:\//, 'https://');
    } else {
      // Sinon, construire avec le workspace ID
      return `${baseUrl}${endpoint}`;
    }
  }

  /**
   * Obtenir l'ID du workspace Jira Asset
   */
  async getWorkspaceId(): Promise<string> {
    if (this.workspaceId) {
      return this.workspaceId;
    }

    // Si JIRA_BASE_PATH_ASSETS contient déjà le workspace ID, l'extraire
    if (this.basePathAssets) {
      const workspaceMatch = this.basePathAssets.match(/workspace\/([a-f0-9-]+)/i);
      if (workspaceMatch && workspaceMatch[1]) {
        this.workspaceId = workspaceMatch[1];
        this.logger.log(`✅ Workspace ID extrait du chemin: ${this.workspaceId}`);
        return this.workspaceId;
      }
    }

    // Sinon, récupérer via l'API
    try {
      const workspaceUrl = this.basePathAssets 
        ? `${this.baseUrlAssets.replace(/\/$/, '')}${this.basePathAssets.replace(/^\/+/, '/')}/workspace`
        : `${this.baseUrlAssets.replace(/\/$/, '')}/rest/servicedeskapi/assets/workspace`;
      
      const response = await firstValueFrom(
        this.httpService.get<{ values: JiraAssetWorkspace[] }>(
          workspaceUrl,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.emailAssets}:${this.apiTokenAssets.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
              Accept: 'application/json',
            },
          },
        ),
      );

      if (response.data.values && response.data.values.length > 0) {
        this.workspaceId = response.data.values[0].workspaceId;
        this.logger.log(`✅ Workspace ID récupéré: ${this.workspaceId}`);
        return this.workspaceId;
      }

      throw new NotFoundException('Aucun workspace Jira Asset trouvé');
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la récupération du workspace: ${error.message}`);
      throw new BadRequestException(`Impossible de récupérer le workspace Jira Asset: ${error.message}`);
    }
  }

  /**
   * Récupérer tous les objets d'un schéma spécifique via AQL (Asset Query Language)
   * @param schemaName Nom du schéma (ex: "Parc Informatique")
   * @param limit Limite du nombre d'objets à récupérer (défaut: 1000)
   */
  async getAllAssetsFromSchema(schemaName: string, limit: number = 1000): Promise<JiraAssetObjectResponse[]> {
    const workspaceId = await this.getWorkspaceId();
    const allAssets: JiraAssetObjectResponse[] = [];
    let start = 0;
    const pageSize = 100; // Taille de page recommandée pour l'API

    try {
      this.logger.log(`🔍 Récupération des objets du schéma "${schemaName}"...`);

      // Construire l'URL en utilisant JIRA_BASE_URL_ASSETS et JIRA_BASE_PATH_ASSETS si disponible
      const searchUrl = this.buildAssetsUrl('aql/objects');

      while (true) {
        const aqlBody = {
          qlQuery: `objectSchema = "${schemaName}"`,
          start,
          limit: pageSize,
        };
        
        const response = await firstValueFrom(
          this.httpService.post<{ values: JiraAssetObjectResponse[]; size: number; start: number; limit: number }>(
            searchUrl,
            aqlBody,
            {
              headers: {
                Authorization: `Basic ${Buffer.from(`${this.emailAssets}:${this.apiTokenAssets.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
            },
          ),
        );

        const assets = response.data.values || [];
        allAssets.push(...assets);

        this.logger.debug(`📦 ${assets.length} objets récupérés (total: ${allAssets.length})`);

        // Vérifier s'il y a plus de résultats
        if (assets.length < pageSize || allAssets.length >= limit) {
          break;
        }

        start += pageSize;
      }

      this.logger.log(`✅ ${allAssets.length} objets récupérés du schéma "${schemaName}"`);
      return allAssets.slice(0, limit); // Limiter au nombre demandé
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la récupération des objets du schéma "${schemaName}": ${error.message}`);
      if (error.response) {
        this.logger.error(`Détails: ${JSON.stringify(error.response.data)}`);
      }
      throw new BadRequestException(`Impossible de récupérer les objets du schéma "${schemaName}": ${error.message}`);
    }
  }

  /**
   * Synchroniser tous les équipements du schéma "Parc Informatique" depuis Jira
   * Cette méthode récupère automatiquement tous les objets du schéma et les synchronise vers MongoDB
   */
  async syncAllFromSchema(
    schemaName: string,
    attributeMapping: {
      serialNumberAttrId: string;
      brandAttrId: string;
      modelAttrId: string;
      typeAttrId: string;
      statusAttrId?: string;
      internalIdAttrId?: string;
      assignedUserAttrId?: string;
    },
  ): Promise<{ created: number; updated: number; errors: number; skipped: number }> {
    const results = { created: 0, updated: 0, errors: 0, skipped: 0 };

    try {
      this.logger.log(`🔄 Début de la synchronisation depuis le schéma "${schemaName}"...`);
      
      // Récupérer tous les assets du schéma via AQL
      const jiraAssets = await this.getAllAssetsFromSchema(schemaName);
      
      this.logger.log(`📦 ${jiraAssets.length} assets trouvés dans le schéma "${schemaName}"`);

      for (const jiraAsset of jiraAssets) {
        try {
          // Vérifier si l'asset a un numéro de série (requis)
          const serialNumberAttr = jiraAsset.attributes.find(
            a => a.objectTypeAttributeId === attributeMapping.serialNumberAttrId
          );
          
          if (!serialNumberAttr || !serialNumberAttr.objectAttributeValues[0]?.value) {
            this.logger.warn(`⚠️ Asset ${jiraAsset.id} ignoré: numéro de série manquant`);
            results.skipped++;
            continue;
          }

          const existingBefore = await this.equipmentModel.findOne({ 
            $or: [
              { jiraAssetId: jiraAsset.id },
              { serialNumber: serialNumberAttr.objectAttributeValues[0].value.toString() }
            ]
          }).exec();

          await this.syncEquipmentFromJira(jiraAsset.id, jiraAsset.objectTypeId, {
            serialNumberAttrId: attributeMapping.serialNumberAttrId,
            brandAttrId: attributeMapping.brandAttrId,
            modelAttrId: attributeMapping.modelAttrId,
            typeAttrId: attributeMapping.typeAttrId,
            statusAttrId: attributeMapping.statusAttrId,
            internalIdAttrId: attributeMapping.internalIdAttrId,
            assignedUserAttrId: attributeMapping.assignedUserAttrId,
          });

          if (existingBefore) {
            results.updated++;
          } else {
            results.created++;
          }
        } catch (error: any) {
          this.logger.error(`❌ Erreur lors de la synchronisation de l'asset ${jiraAsset.id}: ${error.message}`);
          results.errors++;
        }
      }

      this.logger.log(`✅ Synchronisation terminée: ${results.created} créés, ${results.updated} mis à jour, ${results.skipped} ignorés, ${results.errors} erreurs`);
      return results;
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la synchronisation complète: ${error.message}`);
      throw error;
    }
  }

  /**
   * Créer un objet Asset dans Jira
   */
  async createAssetInJira(
    objectTypeId: string,
    attributes: Array<{ objectTypeAttributeId: string; objectAttributeValues: Array<{ value: any }> }>,
  ): Promise<JiraAssetObjectResponse> {
    const workspaceId = await this.getWorkspaceId();

    try {
      const createUrl = this.buildAssetsUrl('object/create');
      const response = await firstValueFrom(
        this.httpService.post<JiraAssetObjectResponse>(
          createUrl,
          {
            objectTypeId,
            attributes,
          },
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.emailAssets}:${this.apiTokenAssets.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`✅ Asset créé dans Jira: ${response.data.objectKey || response.data.id}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la création de l'asset dans Jira: ${error.message}`);
      if (error.response) {
        this.logger.error(`Détails: ${JSON.stringify(error.response.data)}`);
      }
      throw new BadRequestException(`Impossible de créer l'asset dans Jira: ${error.message}`);
    }
  }

  /**
   * Mettre à jour un objet Asset dans Jira
   */
  async updateAssetInJira(
    objectId: string,
    attributes: Array<{ objectTypeAttributeId: string; objectAttributeValues: Array<{ value: any }> }>,
  ): Promise<JiraAssetObjectResponse> {
    const workspaceId = await this.getWorkspaceId();

    try {
      const updateUrl = this.buildAssetsUrl(`object/${objectId}`);
      const response = await firstValueFrom(
        this.httpService.put<JiraAssetObjectResponse>(
          updateUrl,
          {
            attributes,
          },
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.emailAssets}:${this.apiTokenAssets.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`✅ Asset mis à jour dans Jira: ${objectId}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la mise à jour de l'asset dans Jira: ${error.message}`);
      if (error.response) {
        this.logger.error(`Détails: ${JSON.stringify(error.response.data)}`);
      }
      throw new BadRequestException(`Impossible de mettre à jour l'asset dans Jira: ${error.message}`);
    }
  }

  /**
   * Récupérer un objet Asset depuis Jira
   */
  async getAssetFromJira(objectId: string): Promise<JiraAssetObjectResponse> {
    const workspaceId = await this.getWorkspaceId();

    try {
      const getUrl = this.buildAssetsUrl(`object/${objectId}`);
      const response = await firstValueFrom(
        this.httpService.get<JiraAssetObjectResponse>(
          getUrl,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.emailAssets}:${this.apiTokenAssets.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
              Accept: 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la récupération de l'asset depuis Jira: ${error.message}`);
      throw new NotFoundException(`Asset non trouvé dans Jira: ${error.message}`);
    }
  }

  /**
   * Rechercher des objets Asset dans Jira
   */
  async searchAssetsInJira(
    objectTypeId: string,
    query?: string,
    limit: number = 50,
  ): Promise<JiraAssetObjectResponse[]> {
    const workspaceId = await this.getWorkspaceId();

    try {
      // Utiliser l'API de recherche Jira Asset
      // Note: L'API exacte peut varier selon la version de Jira Asset
      const searchUrl = this.buildAssetsUrl('object/navlist/iql');
      const response = await firstValueFrom(
        this.httpService.post<{ values: JiraAssetObjectResponse[] }>(
          searchUrl,
          {
            objectTypeId,
            iql: query || '',
            resultPerPage: limit,
          },
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.emailAssets}:${this.apiTokenAssets.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data.values || [];
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la recherche d'assets dans Jira: ${error.message}`);
      if (error.response) {
        this.logger.error(`Détails: ${JSON.stringify(error.response.data)}`);
      }
      // Si l'API de recherche n'est pas disponible, retourner un tableau vide
      return [];
    }
  }

  /**
   * Synchroniser un équipement depuis Jira vers MongoDB
   */
  async syncEquipmentFromJira(
    jiraAssetId: string,
    objectTypeId: string,
    attributeMapping: {
      serialNumberAttrId?: string;
      brandAttrId?: string;
      modelAttrId?: string;
      typeAttrId?: string;
      statusAttrId?: string;
      internalIdAttrId?: string;
      assignedUserAttrId?: string; // ID de l'attribut utilisateur affecté dans Jira
    },
  ): Promise<EquipmentDocument> {
    const jiraAsset = await this.getAssetFromJira(jiraAssetId);

    // Extraire les attributs selon le mapping
    const getAttributeValue = (attributeId?: string): string | undefined => {
      if (!attributeId) return undefined;
      const attr = jiraAsset.attributes.find(a => a.objectTypeAttributeId === attributeId);
      return attr?.objectAttributeValues[0]?.value?.toString();
    };

    const serialNumber = getAttributeValue(attributeMapping.serialNumberAttrId);
    const brand = getAttributeValue(attributeMapping.brandAttrId);
    const model = getAttributeValue(attributeMapping.modelAttrId);
    const type = getAttributeValue(attributeMapping.typeAttrId);
    const status = getAttributeValue(attributeMapping.statusAttrId);
    const internalId = getAttributeValue(attributeMapping.internalIdAttrId);
    const assignedUserEmail = getAttributeValue(attributeMapping.assignedUserAttrId);

    if (!serialNumber) {
      throw new BadRequestException('Le numéro de série est requis pour synchroniser un équipement');
    }

    // Chercher l'équipement existant par jiraAssetId ou serialNumber
    let equipment = await this.equipmentModel.findOne({
      $or: [
        { jiraAssetId },
        { serialNumber },
      ],
    }).exec();

    const equipmentData: any = {
      serialNumber,
      brand: brand || 'Inconnu',
      model: model || 'Inconnu',
      type: type || 'autre',
      jiraAssetId,
      status: this.mapJiraStatusToEquipmentStatus(status) || EquipmentStatus.DISPONIBLE,
    };

    if (internalId) {
      equipmentData.internalId = internalId;
    }

    // Si un utilisateur est affecté dans Jira, essayer de le trouver dans MongoDB
    // Note: Cela nécessite que l'utilisateur existe déjà dans MongoDB (synchronisé depuis Office 365)
    if (assignedUserEmail && attributeMapping.assignedUserAttrId) {
      const { Model } = require('mongoose');
      const UserModel = this.equipmentModel.db.model('User');
      const user = await UserModel.findOne({ email: assignedUserEmail }).exec();
      if (user) {
        equipmentData.currentUserId = user._id;
        // Si un utilisateur est affecté, le statut devrait être "affecte"
        if (!status || status.toLowerCase() === 'disponible' || status.toLowerCase() === 'available') {
          equipmentData.status = EquipmentStatus.AFFECTE;
        }
      } else {
        this.logger.warn(`⚠️ Utilisateur ${assignedUserEmail} trouvé dans Jira mais non trouvé dans MongoDB. Synchronisez d'abord les utilisateurs depuis Office 365.`);
      }
    }

    if (equipment) {
      // Mettre à jour l'équipement existant
      Object.assign(equipment, equipmentData);
      equipment.lastSyncedAt = new Date();
      await equipment.save();
      this.logger.log(`✅ Équipement mis à jour depuis Jira: ${serialNumber}`);
    } else {
      // Créer un nouvel équipement
      equipment = new this.equipmentModel(equipmentData);
      equipment.lastSyncedAt = new Date();
      await equipment.save();
      this.logger.log(`✅ Équipement créé depuis Jira: ${serialNumber}`);
    }

    return equipment;
  }

  /**
   * Synchroniser un équipement depuis MongoDB vers Jira
   */
  async syncEquipmentToJira(
    equipmentId: string,
    objectTypeId: string,
    attributeMapping: {
      serialNumberAttrId: string;
      brandAttrId: string;
      modelAttrId: string;
      typeAttrId: string;
      statusAttrId: string;
      internalIdAttrId?: string;
      assignedUserAttrId?: string; // ID de l'attribut utilisateur affecté dans Jira
    },
  ): Promise<JiraAssetObjectResponse> {
    const equipment = await this.equipmentModel.findById(equipmentId).populate('currentUserId').exec();
    if (!equipment) {
      throw new NotFoundException(`Équipement avec l'ID ${equipmentId} non trouvé`);
    }

    const attributes = [
      {
        objectTypeAttributeId: attributeMapping.serialNumberAttrId,
        objectAttributeValues: [{ value: equipment.serialNumber }],
      },
      {
        objectTypeAttributeId: attributeMapping.brandAttrId,
        objectAttributeValues: [{ value: equipment.brand }],
      },
      {
        objectTypeAttributeId: attributeMapping.modelAttrId,
        objectAttributeValues: [{ value: equipment.model }],
      },
      {
        objectTypeAttributeId: attributeMapping.typeAttrId,
        objectAttributeValues: [{ value: equipment.type }],
      },
      {
        objectTypeAttributeId: attributeMapping.statusAttrId,
        objectAttributeValues: [{ value: this.mapEquipmentStatusToJira(equipment.status) }],
      },
    ];

    if (attributeMapping.internalIdAttrId && equipment.internalId) {
      attributes.push({
        objectTypeAttributeId: attributeMapping.internalIdAttrId,
        objectAttributeValues: [{ value: equipment.internalId }],
      });
    }

    // Ajouter l'utilisateur affecté si présent
    if (attributeMapping.assignedUserAttrId) {
      const user = equipment.currentUserId as any;
      if (user && user.email) {
        // Pour Jira, on peut utiliser l'email ou l'Atlassian Account ID
        // Si vous avez l'Atlassian Account ID, utilisez-le, sinon utilisez l'email
        attributes.push({
          objectTypeAttributeId: attributeMapping.assignedUserAttrId,
          objectAttributeValues: [{ value: user.email }], // Ou user.atlassianAccountId si disponible
        });
      } else {
        // Si pas d'utilisateur affecté, mettre une valeur vide pour libérer
        attributes.push({
          objectTypeAttributeId: attributeMapping.assignedUserAttrId,
          objectAttributeValues: [],
        });
      }
    }

    if (equipment.jiraAssetId) {
      // Mettre à jour l'asset existant
      const jiraAsset = await this.updateAssetInJira(equipment.jiraAssetId, attributes);
      equipment.lastSyncedAt = new Date();
      await equipment.save();
      return jiraAsset;
    } else {
      // Créer un nouvel asset
      const jiraAsset = await this.createAssetInJira(objectTypeId, attributes);
      equipment.jiraAssetId = jiraAsset.objectKey || jiraAsset.id;
      equipment.lastSyncedAt = new Date();
      await equipment.save();
      return jiraAsset;
    }
  }

  /**
   * Mettre à jour uniquement le statut et l'utilisateur affecté dans Jira
   * Méthode optimisée pour les mises à jour fréquentes (affectation/libération)
   */
  async updateEquipmentStatusInJira(
    equipmentId: string,
    attributeMapping: {
      statusAttrId: string;
      assignedUserAttrId?: string;
    },
  ): Promise<void> {
    const equipment = await this.equipmentModel.findById(equipmentId).populate('currentUserId').exec();
    if (!equipment) {
      throw new NotFoundException(`Équipement avec l'ID ${equipmentId} non trouvé`);
    }

    if (!equipment.jiraAssetId) {
      this.logger.warn(`⚠️ Équipement ${equipmentId} n'a pas de jiraAssetId, impossible de mettre à jour Jira`);
      return;
    }

    const attributes = [
      {
        objectTypeAttributeId: attributeMapping.statusAttrId,
        objectAttributeValues: [{ value: this.mapEquipmentStatusToJira(equipment.status) }],
      },
    ];

    // Mettre à jour l'utilisateur affecté si l'attribut est configuré
    if (attributeMapping.assignedUserAttrId) {
      const user = equipment.currentUserId as any;
      if (user && user.email) {
        attributes.push({
          objectTypeAttributeId: attributeMapping.assignedUserAttrId,
          objectAttributeValues: [{ value: user.email }], // Ou user.atlassianAccountId si disponible
        });
      } else {
        // Libérer l'utilisateur dans Jira
        attributes.push({
          objectTypeAttributeId: attributeMapping.assignedUserAttrId,
          objectAttributeValues: [],
        });
      }
    }

    try {
      await this.updateAssetInJira(equipment.jiraAssetId, attributes);
      equipment.lastSyncedAt = new Date();
      await equipment.save();
      this.logger.log(`✅ Statut Jira mis à jour pour l'équipement ${equipment.serialNumber}`);
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la mise à jour du statut Jira: ${error.message}`);
      // Ne pas faire échouer l'opération si Jira n'est pas disponible
      // L'utilisateur peut toujours affecter/libérer l'équipement dans MongoDB
    }
  }

  /**
   * Synchroniser tous les équipements depuis Jira
   * Récupère tous les assets d'un type d'objet et les synchronise vers MongoDB
   */
  async syncAllFromJira(
    objectTypeId: string,
    attributeMapping: {
      serialNumberAttrId: string;
      brandAttrId: string;
      modelAttrId: string;
      typeAttrId: string;
      statusAttrId?: string;
      internalIdAttrId?: string;
      assignedUserAttrId?: string;
    },
  ): Promise<{ created: number; updated: number; errors: number; skipped: number }> {
    const results = { created: 0, updated: 0, errors: 0, skipped: 0 };

    try {
      this.logger.log(`🔄 Début de la synchronisation depuis Jira pour le type d'objet ${objectTypeId}...`);
      
      // Récupérer tous les assets (utiliser une requête IQL vide pour tout récupérer)
      const jiraAssets = await this.searchAssetsInJira(objectTypeId, '', 10000);
      
      this.logger.log(`📦 ${jiraAssets.length} assets trouvés dans Jira`);

      for (const jiraAsset of jiraAssets) {
        try {
          // Vérifier si l'asset a un numéro de série (requis)
          const serialNumberAttr = jiraAsset.attributes.find(
            a => a.objectTypeAttributeId === attributeMapping.serialNumberAttrId
          );
          
          if (!serialNumberAttr || !serialNumberAttr.objectAttributeValues[0]?.value) {
            this.logger.warn(`⚠️ Asset ${jiraAsset.id} ignoré: numéro de série manquant`);
            results.skipped++;
            continue;
          }

          const existingBefore = await this.equipmentModel.findOne({ 
            $or: [
              { jiraAssetId: jiraAsset.id },
              { serialNumber: serialNumberAttr.objectAttributeValues[0].value.toString() }
            ]
          }).exec();

          await this.syncEquipmentFromJira(jiraAsset.id, objectTypeId, {
            serialNumberAttrId: attributeMapping.serialNumberAttrId,
            brandAttrId: attributeMapping.brandAttrId,
            modelAttrId: attributeMapping.modelAttrId,
            typeAttrId: attributeMapping.typeAttrId,
            statusAttrId: attributeMapping.statusAttrId,
            internalIdAttrId: attributeMapping.internalIdAttrId,
            assignedUserAttrId: attributeMapping.assignedUserAttrId,
          });

          if (existingBefore) {
            results.updated++;
          } else {
            results.created++;
          }
        } catch (error: any) {
          this.logger.error(`❌ Erreur lors de la synchronisation de l'asset ${jiraAsset.id}: ${error.message}`);
          results.errors++;
        }
      }

      this.logger.log(`✅ Synchronisation terminée: ${results.created} créés, ${results.updated} mis à jour, ${results.skipped} ignorés, ${results.errors} erreurs`);
      return results;
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la synchronisation complète: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mapper le statut Jira vers le statut Equipment
   */
  private mapJiraStatusToEquipmentStatus(jiraStatus?: string): EquipmentStatus | undefined {
    if (!jiraStatus) return undefined;

    const statusMap: Record<string, EquipmentStatus> = {
      'disponible': EquipmentStatus.DISPONIBLE,
      'available': EquipmentStatus.DISPONIBLE,
      'affecté': EquipmentStatus.AFFECTE,
      'assigned': EquipmentStatus.AFFECTE,
      'en_reparation': EquipmentStatus.EN_REPARATION,
      'en_maintenance': EquipmentStatus.EN_REPARATION,
      'maintenance': EquipmentStatus.EN_REPARATION,
      'repair': EquipmentStatus.EN_REPARATION,
      'restitue': EquipmentStatus.RESTITUE,
      'returned': EquipmentStatus.RESTITUE,
      'perdu': EquipmentStatus.PERDU,
      'lost': EquipmentStatus.PERDU,
      'detruit': EquipmentStatus.DETRUIT,
      'destroyed': EquipmentStatus.DETRUIT,
    };

    return statusMap[jiraStatus.toLowerCase()] || EquipmentStatus.DISPONIBLE;
  }

  /**
   * Mapper le statut Equipment vers le statut Jira
   */
  private mapEquipmentStatusToJira(status: EquipmentStatus): string {
    const statusMap: Record<EquipmentStatus, string> = {
      [EquipmentStatus.DISPONIBLE]: 'disponible',
      [EquipmentStatus.AFFECTE]: 'affecté',
      [EquipmentStatus.EN_REPARATION]: 'en_reparation',
      [EquipmentStatus.RESTITUE]: 'restitue',
      [EquipmentStatus.PERDU]: 'perdu',
      [EquipmentStatus.DETRUIT]: 'detruit',
    };

    return statusMap[status] || 'disponible';
  }
}

