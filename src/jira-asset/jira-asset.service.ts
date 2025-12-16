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
  private readonly apiToken: string;
  private readonly email: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(Equipment.name) private equipmentModel: Model<EquipmentDocument>,
  ) {
    this.baseUrl = this.configService.get<string>('JIRA_BASE_URL') || '';
    this.apiToken = this.configService.get<string>('JIRA_API_TOKEN') || '';
    this.email = this.configService.get<string>('JIRA_EMAIL') || '';

    if (!this.baseUrl || !this.apiToken || !this.email) {
      this.logger.warn('⚠️ Configuration Jira Asset incomplète. Vérifiez JIRA_BASE_URL, JIRA_API_TOKEN et JIRA_EMAIL dans .env');
    }
  }

  /**
   * Obtenir l'ID du workspace Jira Asset
   */
  async getWorkspaceId(): Promise<string> {
    if (this.workspaceId) {
      return this.workspaceId;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ values: JiraAssetWorkspace[] }>(
          `${this.baseUrl}/rest/servicedeskapi/assets/workspace`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
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
   * Créer un objet Asset dans Jira
   */
  async createAssetInJira(
    objectTypeId: string,
    attributes: Array<{ objectTypeAttributeId: string; objectAttributeValues: Array<{ value: any }> }>,
  ): Promise<JiraAssetObjectResponse> {
    const workspaceId = await this.getWorkspaceId();

    try {
      const response = await firstValueFrom(
        this.httpService.post<JiraAssetObjectResponse>(
          `https://api.atlassian.com/jsm/insight/workspace/${workspaceId}/v1/object/create`,
          {
            objectTypeId,
            attributes,
          },
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
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
      const response = await firstValueFrom(
        this.httpService.put<JiraAssetObjectResponse>(
          `https://api.atlassian.com/jsm/insight/workspace/${workspaceId}/v1/object/${objectId}`,
          {
            attributes,
          },
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
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
      const response = await firstValueFrom(
        this.httpService.get<JiraAssetObjectResponse>(
          `https://api.atlassian.com/jsm/insight/workspace/${workspaceId}/v1/object/${objectId}`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
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
      const response = await firstValueFrom(
        this.httpService.post<{ values: JiraAssetObjectResponse[] }>(
          `https://api.atlassian.com/jsm/insight/workspace/${workspaceId}/v1/object/navlist/iql`,
          {
            objectTypeId,
            iql: query || '',
            resultPerPage: limit,
          },
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
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

