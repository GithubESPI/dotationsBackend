import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Allocation, AllocationDocument, AllocationStatus } from '../database/schemas/allocation.schema';
import { Equipment, EquipmentDocument, EquipmentStatus } from '../database/schemas/equipment.schema';
import { User, UserDocument } from '../database/schemas/user.schema';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';
import { SearchAllocationDto } from './dto/search-allocation.dto';
import { SignAllocationDto } from './dto/sign-allocation.dto';

@Injectable()
export class AllocationsService {
  private readonly logger = new Logger(AllocationsService.name);

  constructor(
    @InjectModel(Allocation.name) private allocationModel: Model<AllocationDocument>,
    @InjectModel(Equipment.name) private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Créer une nouvelle allocation (dotation)
   */
  async create(createDto: CreateAllocationDto, createdBy: string): Promise<AllocationDocument> {
    // Vérifier que l'utilisateur existe
    const user = await this.userModel.findById(createDto.userId).exec();
    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID ${createDto.userId} non trouvé`);
    }

    // Vérifier que tous les matériels existent et sont disponibles
    const equipmentIds = createDto.equipments.map(eq => eq.equipmentId);
    const equipments = await this.equipmentModel.find({
      _id: { $in: equipmentIds },
    }).exec();

    if (equipments.length !== equipmentIds.length) {
      throw new BadRequestException('Un ou plusieurs matériels n\'existent pas');
    }

    // Vérifier que tous les matériels sont disponibles
    const unavailableEquipments = equipments.filter(
      eq => eq.status !== EquipmentStatus.DISPONIBLE || eq.currentUserId !== null
    );

    if (unavailableEquipments.length > 0) {
      throw new BadRequestException(
        `Les matériels suivants ne sont pas disponibles: ${unavailableEquipments.map(e => e.serialNumber).join(', ')}`
      );
    }

    // Préparer les données de l'allocation
    const equipmentItems = createDto.equipments.map(eqDto => {
      const equipment = equipments.find(e => e._id.toString() === eqDto.equipmentId);
      return {
        equipmentId: new Types.ObjectId(eqDto.equipmentId),
        internalId: eqDto.internalId || equipment?.internalId,
        type: eqDto.type || equipment?.type,
        serialNumber: eqDto.serialNumber || equipment?.serialNumber,
        deliveredDate: eqDto.deliveredDate ? new Date(eqDto.deliveredDate) : new Date(),
        condition: eqDto.condition || 'bon_etat',
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
    allocation.status = AllocationStatus.TERMINEE;

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
}

