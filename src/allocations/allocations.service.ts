import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Allocation, AllocationDocument, AllocationStatus } from '../database/schemas/allocation.schema';
import { Equipment, EquipmentDocument, EquipmentStatus } from '../database/schemas/equipment.schema';
import { User, UserDocument } from '../database/schemas/user.schema';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';
import { SearchAllocationDto } from './dto/search-allocation.dto';
import { SignAllocationDto } from './dto/sign-allocation.dto';
import { JiraAssetService } from '../jira-asset/jira-asset.service';

@Injectable()
export class AllocationsService {
  private readonly logger = new Logger(AllocationsService.name);
  private jiraAssetService: JiraAssetService | null = null; // Injection optionnelle

  constructor(
    @InjectModel(Allocation.name) private allocationModel: Model<AllocationDocument>,
    @InjectModel(Equipment.name) private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Optional() @Inject(forwardRef(() => JiraAssetService)) private readonly injectedJiraAssetService?: JiraAssetService,
  ) {
    if (injectedJiraAssetService) {
      this.jiraAssetService = injectedJiraAssetService;
    }
  }

  /**
   * Injecter le service Jira Asset de manière optionnelle
   * Permet de mettre à jour Jira automatiquement lors des affectations/libérations
   */
  setJiraAssetService(jiraAssetService: any) {
    this.jiraAssetService = jiraAssetService;
  }

  /**
   * Créer une nouvelle allocation (dotation)
   */
  async create(createDto: CreateAllocationDto, createdBy: string): Promise<AllocationDocument> {
    this.logger.debug(`📝 Création d'une allocation pour l'utilisateur ${createDto.userId}`);
    this.logger.debug(`📦 Nombre d'équipements fournis: ${createDto.equipments?.length || 0}`);
    this.logger.debug(`📋 Structure des équipements: ${JSON.stringify(createDto.equipments)}`);

    // Vérifier que l'utilisateur existe
    const user = await this.userModel.findById(createDto.userId).exec();
    if (!user) {
      this.logger.error(`❌ Utilisateur non trouvé: ${createDto.userId}`);
      throw new NotFoundException(`Utilisateur avec l'ID ${createDto.userId} non trouvé`);
    }

    // Vérifier que la liste d'équipements n'est pas vide
    if (!createDto.equipments || createDto.equipments.length === 0) {
      this.logger.error(`❌ Aucun équipement fourni dans la requête`);
      throw new BadRequestException('Au moins un matériel doit être fourni pour créer une allocation');
    }

    // Résoudre les IDs d'équipements : accepter equipmentId, jiraAssetId, ou serialNumber
    const equipmentResolutions: Array<{ originalIndex: number; equipmentId: string; source: string }> = [];
    const resolutionErrors: string[] = [];

    for (let index = 0; index < createDto.equipments.length; index++) {
      const eq = createDto.equipments[index];
      const eqAny = eq as any;

      // Essayer plusieurs sources pour trouver l'ID MongoDB
      let equipmentId: string | null = null;
      let source = '';

      // 1. ID MongoDB direct (equipmentId, id, _id)
      if (eq?.equipmentId && Types.ObjectId.isValid(eq.equipmentId)) {
        equipmentId = eq.equipmentId.trim();
        source = 'equipmentId';
      } else if (eqAny?.id && Types.ObjectId.isValid(eqAny.id)) {
        equipmentId = eqAny.id.trim();
        source = 'id';
      } else if (eqAny?._id && Types.ObjectId.isValid(eqAny._id)) {
        equipmentId = eqAny._id.trim();
        source = '_id';
      }
      // 2. Si pas d'ID direct, chercher par jiraAssetId, serialNumber ou internalId
      else if (eqAny?.jiraAssetId || eqAny?.serialNumber || eqAny?.internalId) {
        const orConditions: any[] = [];
        const sources: string[] = [];

        if (eqAny.jiraAssetId) {
          orConditions.push({ jiraAssetId: eqAny.jiraAssetId.toString() });
          sources.push(`jiraAssetId:${eqAny.jiraAssetId}`);
        }
        if (eqAny.serialNumber) {
          orConditions.push({ serialNumber: eqAny.serialNumber.toString().trim() });
          sources.push(`serialNumber:${eqAny.serialNumber}`);
        }
        if (eqAny.internalId) {
          orConditions.push({ internalId: eqAny.internalId.toString().trim() });
          sources.push(`internalId:${eqAny.internalId}`);
        }

        source = sources.join(' OR ');
        this.logger.debug(`🔍 Recherche d'équipement par ${source}...`);

        // Utiliser findOne avec $or pour trouver si l'un des critères correspond
        const foundEquipment = await this.equipmentModel.findOne({ $or: orConditions }).exec();

        if (foundEquipment) {
          equipmentId = foundEquipment._id.toString();
          this.logger.debug(`✅ Équipement trouvé: ${equipmentId} (Serial: ${foundEquipment.serialNumber}) via recherche flexible`);
        } else {
          resolutionErrors.push(`Index ${index}: Aucun équipement trouvé avec ${source}`);
          this.logger.warn(`⚠️ Aucun équipement trouvé avec ${source}`);
        }
      }

      if (equipmentId && Types.ObjectId.isValid(equipmentId)) {
        equipmentResolutions.push({
          originalIndex: index,
          equipmentId: equipmentId.trim(),
          source,
        });
      } else {
        resolutionErrors.push(`Index ${index}: Impossible de résoudre l'ID (structure: ${JSON.stringify(eq).substring(0, 150)})`);
      }
    }

    if (equipmentResolutions.length === 0) {
      this.logger.error(`❌ Aucun équipement valide trouvé. Erreurs: ${JSON.stringify(resolutionErrors)}`);
      throw new BadRequestException(
        `Aucun matériel valide trouvé. Erreurs: ${resolutionErrors.join('; ')}`
      );
    }

    if (equipmentResolutions.length !== createDto.equipments.length) {
      this.logger.warn(`⚠️ ${createDto.equipments.length - equipmentResolutions.length} équipement(s) non résolu(s)`);
      this.logger.warn(`Erreurs: ${JSON.stringify(resolutionErrors)}`);
      throw new BadRequestException(
        `Un ou plusieurs matériels n'ont pas pu être trouvés. Résolus: ${equipmentResolutions.length}/${createDto.equipments.length}. Erreurs: ${resolutionErrors.join('; ')}`
      );
    }

    const equipmentIds = equipmentResolutions.map(r => r.equipmentId);
    this.logger.debug(`✅ ${equipmentIds.length} équipement(s) résolu(s): ${equipmentResolutions.map(r => `${r.source}→${r.equipmentId}`).join(', ')}`);

    // Récupérer les équipements depuis MongoDB
    const equipments = await this.equipmentModel.find({
      _id: { $in: equipmentIds.map(id => new Types.ObjectId(id)) },
    }).exec();

    if (equipments.length !== equipmentIds.length) {
      const foundIds = equipments.map(eq => eq._id.toString());
      const missingIds = equipmentIds.filter(id => !foundIds.includes(id));
      this.logger.error(`❌ ${missingIds.length} équipement(s) non trouvé(s) dans MongoDB`);
      this.logger.error(`IDs manquants: ${JSON.stringify(missingIds)}`);
      throw new BadRequestException(
        `Un ou plusieurs matériels n'existent pas. IDs manquants: ${missingIds.join(', ')}`
      );
    }

    // CORRECTIF: Si le statut est DISPONIBLE ou EN_REPARATION, on considère que c'est bon
    // ÉGALEMENT: Si le statut est AFFECTE mais assigné au MÊME utilisateur, on l'autorise (cas de la synchro Jira rétroactive)
    const unavailableEquipments = equipments.filter(eq => {
      // Si en stock, en réparation ou restitué, c'est disponible pour une nouvelle affectation
      if (
        eq.status === EquipmentStatus.EN_STOCK ||
        eq.status === EquipmentStatus.EN_REPARATION ||
        eq.status === EquipmentStatus.RESTITUE
      ) return false;
      
      // Si déjà affecté à cet utilisateur exact (ex: synchro Jira qui a mis à jour l'équipement avant de créer l'allocation), on autorise
      if (eq.status === EquipmentStatus.AFFECTE && eq.currentUserId && eq.currentUserId.toString() === createDto.userId.toString()) {
        return false;
      }
      
      // Sinon, ce n'est pas disponible
      return true;
    });

    if (unavailableEquipments.length > 0) {
      const unavailableDetails = unavailableEquipments.map(e => ({
        serialNumber: e.serialNumber,
        status: e.status,
        currentUserId: e.currentUserId,
      }));
      this.logger.error(`❌ ${unavailableEquipments.length} équipement(s) non disponible(s)`);
      this.logger.error(`Détails: ${JSON.stringify(unavailableDetails)}`);
      throw new BadRequestException(
        `Les matériels suivants ne sont pas disponibles: ${unavailableEquipments.map(e => `${e.serialNumber} (${e.status}${e.currentUserId ? ', déjà affecté' : ''})`).join(', ')}`
      );
    }

    // NOUVEAU : Vérifier si une allocation active existe déjà pour l'un de ces équipements
    // Cela évite les doublons dans la "documentation" sur le profil de l'employé
    for (const eqId of equipmentIds) {
      const activeAlloc = await this.allocationModel.findOne({
        'equipments.equipmentId': new Types.ObjectId(eqId),
        status: { $in: [AllocationStatus.EN_COURS, AllocationStatus.EN_RETARD] },
      }).exec();

      if (activeAlloc) {
        if (activeAlloc.userId.toString() === createDto.userId.toString()) {
          this.logger.log(`ℹ️ Une allocation active existe déjà pour l'équipement ${eqId} et cet utilisateur. Retour de l'existante.`);
          return activeAlloc.populate('userId', 'displayName email department');
        } else {
          this.logger.warn(`⚠️ L'équipement ${eqId} est déjà présent dans une autre allocation active (${activeAlloc._id})`);
          // Note: Normalement indisponible déjà géré au-dessus, mais cette double vérification est plus sûre pour la logique métier
        }
      }
    }

    // Préparer les données de l'allocation
    // Utiliser les résolutions pour mapper correctement les équipements
    const equipmentItems = equipmentResolutions.map(resolution => {
      const eqDto = createDto.equipments[resolution.originalIndex];
      const equipment = equipments.find(e => e._id.toString() === resolution.equipmentId);
      const eqAny = eqDto as any;

      return {
        equipmentId: new Types.ObjectId(resolution.equipmentId),
        internalId: eqAny?.internalId || equipment?.internalId,
        type: eqAny?.type || equipment?.type,
        serialNumber: eqAny?.serialNumber || equipment?.serialNumber,
        deliveredDate: eqAny?.deliveredDate ? new Date(eqAny.deliveredDate) : new Date(),
        condition: eqAny?.condition || 'bon_etat',
      };
    });

    // Créer l'allocation
    const allocation = new this.allocationModel({
      userId: new Types.ObjectId(createDto.userId),
      userName: user.displayName,
      userEmail: user.email,
      equipments: equipmentItems,
      deliveryDate: createDto.deliveryDate ? new Date(createDto.deliveryDate) : new Date(),
      status: AllocationStatus.EN_COURS,
      accessories: createDto.accessories || [],
      additionalSoftware: createDto.additionalSoftware || [],
      standardSoftware: ['MS Office', 'Antivirus'], // Logiciels standards (à configurer)
      services: createDto.services || [],
      notes: createDto.notes,
      createdBy,
    });

    const savedAllocation = await allocation.save();

    // Affecter les matériels à l'utilisateur
    for (const equipment of equipments) {
      equipment.currentUserId = new Types.ObjectId(createDto.userId);
      equipment.status = EquipmentStatus.AFFECTE;
      await equipment.save();

      // Mettre à jour Jira automatiquement si l'équipement est synchronisé avec Jira
      if (equipment.jiraAssetId && this.jiraAssetService) {
        try {
          this.logger.log(`🔄 [ALLOCATION→JIRA] Mise à jour Jira pour ${equipment.serialNumber} (jiraAssetId: ${equipment.jiraAssetId}, status: AFFECTE, user: ${user.displayName})`);
          // Mettre à jour uniquement le statut et l'utilisateur dans Jira (méthode optimisée)
          await this.jiraAssetService.updateEquipmentStatusInJira(equipment._id.toString(), {
            statusAttrId: undefined, // Sera détecté automatiquement
            assignedUserAttrId: undefined, // Sera détecté automatiquement
          });
          this.logger.log(`✅ [ALLOCATION→JIRA] Jira synchronisé avec succès pour ${equipment.serialNumber}`);
        } catch (error: any) {
          // Ne pas faire échouer l'allocation si Jira n'est pas disponible
          this.logger.error(`❌ [ALLOCATION→JIRA] Échec synchronisation Jira pour ${equipment.serialNumber}: ${error.message}`);
          if (error.response?.data) {
            this.logger.error(`   Détails API: ${JSON.stringify(error.response.data)}`);
          }
        }
      } else if (equipment.jiraAssetId && !this.jiraAssetService) {
        this.logger.warn(`⚠️ [ALLOCATION→JIRA] Équipement ${equipment.serialNumber} a un jiraAssetId (${equipment.jiraAssetId}) mais le service Jira n'est pas injecté ! La synchronisation ne fonctionnera pas.`);
      } else if (!equipment.jiraAssetId) {
        this.logger.debug(`ℹ️ Équipement ${equipment.serialNumber} n'a pas de jiraAssetId, pas de sync Jira`);
      }
    }

    this.logger.log(`✅ Allocation créée: ${savedAllocation._id} pour ${user.displayName}`);

    return savedAllocation.populate('userId', 'displayName email department');
  }

  /**
   * Rechercher des allocations avec filtres et pagination
   */
  async search(searchDto: SearchAllocationDto) {
    const { query, userId, status, startDate, endDate, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;

    // Construire le filtre
    const filter: any = {};

    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.deliveryDate = {};
      if (startDate) {
        filter.deliveryDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.deliveryDate.$lte = new Date(endDate);
      }
    }

    // Recherche textuelle (nom utilisateur, email)
    if (query) {
      filter.$or = [
        { userName: { $regex: query, $options: 'i' } },
        { userEmail: { $regex: query, $options: 'i' } },
      ];
    }

    // Exécuter la requête
    const [allocations, total] = await Promise.all([
      this.allocationModel
        .find(filter)
        .populate('userId', 'displayName email department')
        .populate('equipments.equipmentId', 'brand model serialNumber type')
        .skip(skip)
        .limit(limit)
        .sort({ deliveryDate: -1 })
        .exec(),
      this.allocationModel.countDocuments(filter).exec(),
    ]);

    return {
      data: allocations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtenir toutes les allocations
   */
  async findAll(): Promise<AllocationDocument[]> {
    return this.allocationModel
      .find()
      .populate('userId', 'displayName email department')
      .populate('equipments.equipmentId', 'brand model serialNumber type')
      .sort({ deliveryDate: -1 })
      .exec();
  }

  /**
   * Obtenir une allocation par ID
   */
  async findOne(id: string): Promise<AllocationDocument> {
    const allocation = await this.allocationModel
      .findById(id)
      .populate('userId', 'displayName email department officeLocation')
      .populate('equipments.equipmentId', 'brand model serialNumber type internalId jiraAssetId')
      .exec();

    if (!allocation) {
      throw new NotFoundException(`Allocation avec l'ID ${id} non trouvé`);
    }

    return allocation;
  }

  /**
   * Obtenir les allocations d'un utilisateur
   */
  async findByUserId(userId: string): Promise<AllocationDocument[]> {
    return this.allocationModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('userId', 'displayName email department')
      .populate('equipments.equipmentId', 'brand model serialNumber type')
      .sort({ deliveryDate: -1 })
      .exec();
  }

  /**
   * Mettre à jour une allocation
   */
  async update(id: string, updateDto: UpdateAllocationDto): Promise<AllocationDocument> {
    const allocation = await this.findOne(id);

    // Vérifier que l'allocation n'est pas signée
    if (allocation.signatureData) {
      throw new BadRequestException('Impossible de modifier une allocation déjà signée');
    }

    Object.assign(allocation, updateDto);
    return allocation.save();
  }

  /**
   * Signer une allocation
   */
  async sign(id: string, signDto: SignAllocationDto): Promise<AllocationDocument> {
    const allocation = await this.findOne(id);

    if (allocation.signatureData) {
      throw new BadRequestException('Cette allocation est déjà signée');
    }

    allocation.signatureData = {
      signerName: signDto.signerName,
      signatureImage: signDto.signatureImage,
      timestamp: new Date(),
    };

    allocation.signedAt = new Date();
    allocation.status = AllocationStatus.EN_COURS;

    return allocation.save();
  }

  /**
   * Obtenir les statistiques des allocations
   */
  async getStats() {
    const [
      total,
      enCours,
      terminee,
      enRetard,
      annulee,
      byMonth,
    ] = await Promise.all([
      this.allocationModel.countDocuments().exec(),
      this.allocationModel.countDocuments({ status: AllocationStatus.EN_COURS }).exec(),
      this.allocationModel.countDocuments({ status: AllocationStatus.TERMINEE }).exec(),
      this.allocationModel.countDocuments({ status: AllocationStatus.EN_RETARD }).exec(),
      this.allocationModel.countDocuments({ status: AllocationStatus.ANNULEE }).exec(),
      this.allocationModel.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$deliveryDate' },
              month: { $month: '$deliveryDate' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 },
      ]).exec(),
    ]);

    return {
      total,
      byStatus: {
        enCours,
        terminee,
        enRetard,
        annulee,
      },
      byMonth,
    };
  }
  /**
   * Clôturer automatiquement une allocation active pour un équipement donné
   * Utilisé lors de la synchronisation Jira quand un équipement revient "En stock"
   */
  async closeActiveAllocationForEquipment(equipmentId: string): Promise<void> {
    try {
      // Chercher une allocation active contenant cet équipement
      const allocation = await this.allocationModel.findOne({
        status: AllocationStatus.EN_COURS,
        'equipments.equipmentId': new Types.ObjectId(equipmentId),
      }).exec();

      if (!allocation) {
        // Pas d'allocation active, rien à faire
        return;
      }

      this.logger.log(`🔄 Clôture automatique de l'allocation ${allocation._id} suite au retour en stock de l'équipement ${equipmentId}`);

      // Mettre à jour le statut
      allocation.status = AllocationStatus.TERMINEE;

      // Ajouter une note explicative
      const autoNote = `[AUTO] Clôture automatique le ${new Date().toLocaleString('fr-FR')} suite à la détection du statut "En stock" dans Jira.`;
      allocation.notes = allocation.notes ? `${allocation.notes}\n${autoNote}` : autoNote;

      // Marquer comme rendu ce jour
      // Note: On pourrait aussi mettre à jour la date de fin réelle si on avait un champ pour ça
      // Pour l'instant, le passage à TERMINEE suffit

      await allocation.save();
      this.logger.log(`✅ Allocation ${allocation._id} clôturée avec succès`);

    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la clôture automatique de l'allocation pour l'équipement ${equipmentId}: ${error.message}`);
      // Ne pas bloquer le processus appelant
    }
  }

  /**
   * Chercher une allocation active (en cours ou en retard) pour un équipement
   */
  async getActiveAllocationForEquipment(equipmentId: string): Promise<AllocationDocument | null> {
    return this.allocationModel.findOne({
      'equipments.equipmentId': new Types.ObjectId(equipmentId),
      status: { $in: [AllocationStatus.EN_COURS, AllocationStatus.EN_RETARD] },
    }).exec();
  }
}

