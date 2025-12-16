import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Equipment, EquipmentDocument, EquipmentType, EquipmentStatus } from '../database/schemas/equipment.schema';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { SearchEquipmentDto } from './dto/search-equipment.dto';

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name);
  private jiraAssetService: any = null; // Injection optionnelle pour éviter les dépendances circulaires

  constructor(
    @InjectModel(Equipment.name) private equipmentModel: Model<EquipmentDocument>,
  ) {}

  /**
   * Injecter le service Jira Asset de manière optionnelle
   * Permet de mettre à jour Jira automatiquement lors des affectations/libérations
   */
  setJiraAssetService(jiraAssetService: any) {
    this.jiraAssetService = jiraAssetService;
  }

  /**
   * Créer un nouveau matériel
   */
  async create(createDto: CreateEquipmentDto): Promise<EquipmentDocument> {
    // Vérifier que le numéro de série n'existe pas déjà
    const existing = await this.equipmentModel.findOne({
      serialNumber: createDto.serialNumber,
    });

    if (existing) {
      throw new BadRequestException(
        `Un matériel avec le numéro de série ${createDto.serialNumber} existe déjà`
      );
    }

    const equipment = new this.equipmentModel({
      ...createDto,
      status: createDto.status || EquipmentStatus.DISPONIBLE,
    });

    return equipment.save();
  }

  /**
   * Rechercher des matériels avec filtres et pagination
   */
  async search(searchDto: SearchEquipmentDto) {
    const { query, type, status, brand, location, currentUserId, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;

    // Construire le filtre
    const filter: any = {};

    if (type) {
      filter.type = type;
    }

    if (status) {
      filter.status = status;
    }

    if (brand) {
      filter.brand = { $regex: brand, $options: 'i' };
    }

    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }

    if (currentUserId) {
      filter.currentUserId = currentUserId;
    }

    // Recherche textuelle (marque, modèle, N° série, N° interne)
    if (query) {
      filter.$or = [
        { brand: { $regex: query, $options: 'i' } },
        { model: { $regex: query, $options: 'i' } },
        { serialNumber: { $regex: query, $options: 'i' } },
        { internalId: { $regex: query, $options: 'i' } },
        { jiraAssetId: { $regex: query, $options: 'i' } },
      ];
    }

    // Exécuter la requête
    const [equipments, total] = await Promise.all([
      this.equipmentModel
        .find(filter)
        .populate('currentUserId', 'displayName email')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.equipmentModel.countDocuments(filter).exec(),
    ]);

    return {
      data: equipments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtenir tous les matériels
   */
  async findAll(): Promise<EquipmentDocument[]> {
    return this.equipmentModel
      .find()
      .populate('currentUserId', 'displayName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Obtenir un matériel par ID
   */
  async findOne(id: string): Promise<EquipmentDocument> {
    const equipment = await this.equipmentModel
      .findById(id)
      .populate('currentUserId', 'displayName email department')
      .exec();

    if (!equipment) {
      throw new NotFoundException(`Matériel avec l'ID ${id} non trouvé`);
    }

    return equipment;
  }

  /**
   * Obtenir un matériel par numéro de série
   */
  async findBySerialNumber(serialNumber: string): Promise<EquipmentDocument | null> {
    return this.equipmentModel.findOne({ serialNumber }).exec();
  }

  /**
   * Obtenir un matériel par ID Jira Asset
   */
  async findByJiraAssetId(jiraAssetId: string): Promise<EquipmentDocument | null> {
    return this.equipmentModel.findOne({ jiraAssetId }).exec();
  }

  /**
   * Obtenir les matériels disponibles (non affectés)
   */
  async findAvailable(): Promise<EquipmentDocument[]> {
    return this.equipmentModel
      .find({
        status: EquipmentStatus.DISPONIBLE,
        currentUserId: null,
      })
      .sort({ brand: 1, model: 1 })
      .exec();
  }

  /**
   * Obtenir les matériels affectés à un utilisateur
   */
  async findByUserId(userId: string): Promise<EquipmentDocument[]> {
    return this.equipmentModel
      .find({ currentUserId: userId })
      .populate('currentUserId', 'displayName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Mettre à jour un matériel
   */
  async update(id: string, updateDto: UpdateEquipmentDto): Promise<EquipmentDocument> {
    const equipment = await this.findOne(id);

    // Vérifier que le numéro de série n'existe pas déjà (si modifié)
    if (updateDto.serialNumber && updateDto.serialNumber !== equipment.serialNumber) {
      const existing = await this.equipmentModel.findOne({
        serialNumber: updateDto.serialNumber,
        _id: { $ne: id },
      });

      if (existing) {
        throw new BadRequestException(
          `Un matériel avec le numéro de série ${updateDto.serialNumber} existe déjà`
        );
      }
    }

    Object.assign(equipment, updateDto);
    return equipment.save();
  }

  /**
   * Affecter un matériel à un utilisateur
   */
  async assignToUser(equipmentId: string, userId: string, jiraConfig?: { statusAttrId: string; assignedUserAttrId?: string }): Promise<EquipmentDocument> {
    const equipment = await this.findOne(equipmentId);

    if (equipment.status !== EquipmentStatus.DISPONIBLE) {
      throw new BadRequestException(
        `Le matériel n'est pas disponible. Statut actuel: ${equipment.status}`
      );
    }

    if (equipment.currentUserId) {
      throw new BadRequestException('Le matériel est déjà affecté à un utilisateur');
    }

    equipment.currentUserId = userId as any;
    equipment.status = EquipmentStatus.AFFECTE;
    const savedEquipment = await equipment.save();

    // Mettre à jour Jira si configuré et si le service est disponible
    if (jiraConfig && this.jiraAssetService && equipment.jiraAssetId) {
      try {
        await this.jiraAssetService.updateEquipmentStatusInJira(equipmentId, {
          statusAttrId: jiraConfig.statusAttrId,
          assignedUserAttrId: jiraConfig.assignedUserAttrId,
        });
        this.logger.log(`✅ Statut Jira mis à jour pour l'équipement ${equipment.serialNumber}`);
      } catch (error: any) {
        this.logger.warn(`⚠️ Impossible de mettre à jour Jira: ${error.message}`);
        // Ne pas faire échouer l'affectation si Jira n'est pas disponible
      }
    }

    return savedEquipment;
  }

  /**
   * Libérer un matériel (le rendre disponible)
   */
  async release(equipmentId: string, jiraConfig?: { statusAttrId: string; assignedUserAttrId?: string }): Promise<EquipmentDocument> {
    const equipment = await this.findOne(equipmentId);

    equipment.currentUserId = undefined;
    equipment.status = EquipmentStatus.DISPONIBLE;
    const savedEquipment = await equipment.save();

    // Mettre à jour Jira si configuré et si le service est disponible
    if (jiraConfig && this.jiraAssetService && equipment.jiraAssetId) {
      try {
        await this.jiraAssetService.updateEquipmentStatusInJira(equipmentId, {
          statusAttrId: jiraConfig.statusAttrId,
          assignedUserAttrId: jiraConfig.assignedUserAttrId,
        });
        this.logger.log(`✅ Statut Jira mis à jour pour l'équipement ${equipment.serialNumber}`);
      } catch (error: any) {
        this.logger.warn(`⚠️ Impossible de mettre à jour Jira: ${error.message}`);
        // Ne pas faire échouer la libération si Jira n'est pas disponible
      }
    }

    return savedEquipment;
  }

  /**
   * Supprimer un matériel
   */
  async remove(id: string): Promise<void> {
    const equipment = await this.findOne(id);

    // Vérifier que le matériel n'est pas affecté
    if (equipment.currentUserId) {
      throw new BadRequestException(
        'Impossible de supprimer un matériel affecté à un utilisateur. Libérez-le d\'abord.'
      );
    }

    await this.equipmentModel.findByIdAndDelete(id).exec();
  }

  /**
   * Obtenir les statistiques des matériels
   */
  async getStats() {
    const [
      total,
      disponible,
      affecte,
      enReparation,
      restitue,
      perdu,
      detruit,
      byType,
      byBrand,
    ] = await Promise.all([
      this.equipmentModel.countDocuments().exec(),
      this.equipmentModel.countDocuments({ status: EquipmentStatus.DISPONIBLE }).exec(),
      this.equipmentModel.countDocuments({ status: EquipmentStatus.AFFECTE }).exec(),
      this.equipmentModel.countDocuments({ status: EquipmentStatus.EN_REPARATION }).exec(),
      this.equipmentModel.countDocuments({ status: EquipmentStatus.RESTITUE }).exec(),
      this.equipmentModel.countDocuments({ status: EquipmentStatus.PERDU }).exec(),
      this.equipmentModel.countDocuments({ status: EquipmentStatus.DETRUIT }).exec(),
      this.equipmentModel.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).exec(),
      this.equipmentModel.aggregate([
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).exec(),
    ]);

    return {
      total,
      byStatus: {
        disponible,
        affecte,
        enReparation,
        restitue,
        perdu,
        detruit,
      },
      byType,
      byBrand,
    };
  }
}

