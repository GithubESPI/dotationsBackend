import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Return, ReturnDocument } from '../database/schemas/return.schema';
import { Allocation, AllocationDocument } from '../database/schemas/allocation.schema';
import { Equipment, EquipmentDocument, EquipmentStatus } from '../database/schemas/equipment.schema';
import { User, UserDocument } from '../database/schemas/user.schema';
import { CreateReturnDto } from './dto/create-return.dto';
import { SearchReturnDto } from './dto/search-return.dto';
import { SignReturnDto, SignerRole } from './dto/sign-return.dto';

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectModel(Return.name) private returnModel: Model<ReturnDocument>,
    @InjectModel(Allocation.name) private allocationModel: Model<AllocationDocument>,
    @InjectModel(Equipment.name) private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Créer une nouvelle restitution
   */
  async create(createDto: CreateReturnDto, createdBy: string): Promise<ReturnDocument> {
    // Vérifier que l'allocation existe
    const allocation = await this.allocationModel
      .findById(createDto.allocationId)
      .populate('userId')
      .exec();

    if (!allocation) {
      throw new NotFoundException(`Allocation avec l'ID ${createDto.allocationId} non trouvée`);
    }

    const user = allocation.userId as any as UserDocument;
    if (!user) {
      throw new NotFoundException('Utilisateur associé à l\'allocation non trouvé');
    }

    // Vérifier que les matériels à restituer appartiennent bien à cette allocation
    const allocationEquipmentIds = allocation.equipments.map(eq => eq.equipmentId.toString());
    const returnEquipmentIds = createDto.equipmentsReturned.map(eq => eq.equipmentId);

    const invalidEquipments = returnEquipmentIds.filter(
      id => !allocationEquipmentIds.includes(id)
    );

    if (invalidEquipments.length > 0) {
      throw new BadRequestException(
        `Les matériels suivants n'appartiennent pas à cette allocation: ${invalidEquipments.join(', ')}`
      );
    }

    // Vérifier que les matériels existent
    const validEquipmentIds = returnEquipmentIds.filter(
      id => id && id.trim() !== '' && Types.ObjectId.isValid(id)
    );
    
    if (validEquipmentIds.length === 0) {
      throw new BadRequestException('Aucun matériel valide fourni');
    }
    
    if (validEquipmentIds.length !== returnEquipmentIds.length) {
      throw new BadRequestException('Un ou plusieurs IDs de matériel sont invalides');
    }
    
    const equipments = await this.equipmentModel.find({
      _id: { $in: validEquipmentIds.map(id => new Types.ObjectId(id)) },
    }).exec();

    if (equipments.length !== returnEquipmentIds.length) {
      throw new BadRequestException('Un ou plusieurs matériels n\'existent pas');
    }

    // Préparer les données de restitution
    const equipmentsReturned = createDto.equipmentsReturned.map(eqDto => {
      const equipment = equipments.find(e => e._id.toString() === eqDto.equipmentId);
      return {
        equipmentId: new Types.ObjectId(eqDto.equipmentId),
        internalId: eqDto.internalId || equipment?.internalId,
        serialNumber: eqDto.serialNumber || equipment?.serialNumber,
        returnDate: createDto.returnDate ? new Date(createDto.returnDate) : new Date(),
        condition: eqDto.condition,
        notes: eqDto.notes,
        photos: eqDto.photos || [],
      };
    });

    // Créer la restitution
    const returnDoc = new this.returnModel({
      allocationId: new Types.ObjectId(createDto.allocationId),
      userId: allocation.userId,
      userName: allocation.userName,
      equipmentsReturned,
      returnDate: createDto.returnDate ? new Date(createDto.returnDate) : new Date(),
      removedSoftware: createDto.removedSoftware || [],
      createdBy,
    });

    const savedReturn = await returnDoc.save();

    // Mettre à jour le statut des matériels
    for (const equipment of equipments) {
      equipment.status = EquipmentStatus.RESTITUE;
      equipment.currentUserId = undefined; // Libérer le matériel
      await equipment.save();
    }

    // Mettre à jour le statut de l'allocation
    allocation.status = 'terminee' as any;
    await allocation.save();

    this.logger.log(`✅ Restitution créée: ${savedReturn._id} pour ${user.displayName}`);

    await savedReturn.populate('allocationId');
    await savedReturn.populate('userId', 'displayName email department');
    return savedReturn;
  }

  /**
   * Rechercher des restitutions avec filtres et pagination
   */
  async search(searchDto: SearchReturnDto) {
    const { query, userId, allocationId, startDate, endDate, soldeToutCompte, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;

    // Construire le filtre
    const filter: any = {};

    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }

    if (allocationId) {
      filter.allocationId = new Types.ObjectId(allocationId);
    }

    if (startDate || endDate) {
      filter.returnDate = {};
      if (startDate) {
        filter.returnDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.returnDate.$lte = new Date(endDate);
      }
    }

    if (soldeToutCompte !== undefined) {
      filter['rhValidation.soldeToutCompte'] = soldeToutCompte;
    }

    // Recherche textuelle (nom utilisateur, email)
    if (query) {
      filter.$or = [
        { userName: { $regex: query, $options: 'i' } },
      ];
    }

    // Exécuter la requête
    const [returns, total] = await Promise.all([
      this.returnModel
        .find(filter)
        .populate('allocationId', 'deliveryDate equipments')
        .populate('userId', 'displayName email department')
        .populate('equipmentsReturned.equipmentId', 'brand model serialNumber type')
        .skip(skip)
        .limit(limit)
        .sort({ returnDate: -1 })
        .exec(),
      this.returnModel.countDocuments(filter).exec(),
    ]);

    return {
      data: returns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtenir toutes les restitutions
   */
  async findAll(): Promise<ReturnDocument[]> {
    return this.returnModel
      .find()
      .populate('allocationId', 'deliveryDate equipments')
      .populate('userId', 'displayName email department')
      .populate('equipmentsReturned.equipmentId', 'brand model serialNumber type')
      .sort({ returnDate: -1 })
      .exec();
  }

  /**
   * Obtenir une restitution par ID
   */
  async findOne(id: string): Promise<ReturnDocument> {
    const returnDoc = await this.returnModel
      .findById(id)
      .populate('allocationId', 'deliveryDate equipments accessories additionalSoftware services')
      .populate('userId', 'displayName email department officeLocation')
      .populate('equipmentsReturned.equipmentId', 'brand model serialNumber type internalId jiraAssetId')
      .exec();

    if (!returnDoc) {
      throw new NotFoundException(`Restitution avec l'ID ${id} non trouvée`);
    }

    return returnDoc;
  }

  /**
   * Obtenir les restitutions d'un utilisateur
   */
  async findByUserId(userId: string): Promise<ReturnDocument[]> {
    return this.returnModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('allocationId', 'deliveryDate equipments')
      .populate('equipmentsReturned.equipmentId', 'brand model serialNumber type')
      .sort({ returnDate: -1 })
      .exec();
  }

  /**
   * Obtenir les restitutions d'une allocation
   */
  async findByAllocationId(allocationId: string): Promise<ReturnDocument[]> {
    return this.returnModel
      .find({ allocationId: new Types.ObjectId(allocationId) })
      .populate('equipmentsReturned.equipmentId', 'brand model serialNumber type')
      .sort({ returnDate: -1 })
      .exec();
  }

  /**
   * Signer une restitution
   */
  async sign(id: string, signDto: SignReturnDto): Promise<ReturnDocument> {
    const returnDoc = await this.findOne(id);

    // Vérifier que le rôle n'a pas déjà signé
    const existingSignature = this.getSignatureByRole(returnDoc, signDto.signerRole);
    if (existingSignature) {
      throw new BadRequestException(
        `Cette restitution est déjà signée par ${signDto.signerRole.toUpperCase()}`
      );
    }

    // Ajouter la signature selon le rôle
    const signatureData = {
      signerName: signDto.signerName,
      signatureImage: signDto.signatureImage,
      timestamp: new Date(),
    };

    switch (signDto.signerRole) {
      case SignerRole.EMPLOYEE:
        returnDoc.signatureDataEmployee = signatureData;
        break;
      case SignerRole.IT:
        returnDoc.signatureDataIT = signatureData;
        break;
      case SignerRole.HR:
        returnDoc.signatureDataHR = signatureData;
        break;
    }

    returnDoc.signedAt = new Date();
    return returnDoc.save();
  }

  /**
   * Valider la restitution par la RH (solde de tout compte)
   */
  async validateByHR(id: string, validatedBy: string, soldeToutCompte: boolean = false): Promise<ReturnDocument> {
    const returnDoc = await this.findOne(id);

    // Vérifier que toutes les signatures sont présentes
    if (!returnDoc.signatureDataEmployee) {
      throw new BadRequestException('La signature de l\'utilisateur est requise');
    }

    if (!returnDoc.signatureDataIT) {
      throw new BadRequestException('La signature du responsable IT est requise');
    }

    returnDoc.rhValidation = {
      validatedBy,
      validatedAt: new Date(),
      soldeToutCompte,
    };

    returnDoc.completedAt = new Date();
    return returnDoc.save();
  }

  /**
   * Obtenir les statistiques des restitutions
   */
  async getStats() {
    const [
      total,
      pendingHRValidation,
      completed,
      soldeToutCompte,
      byMonth,
    ] = await Promise.all([
      this.returnModel.countDocuments().exec(),
      this.returnModel.countDocuments({ rhValidation: { $exists: false } }).exec(),
      this.returnModel.countDocuments({ completedAt: { $exists: true } }).exec(),
      this.returnModel.countDocuments({ 'rhValidation.soldeToutCompte': true }).exec(),
      this.returnModel.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$returnDate' },
              month: { $month: '$returnDate' },
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
      pendingHRValidation,
      completed,
      soldeToutCompte,
      byMonth,
    };
  }

  /**
   * Helper: Récupérer la signature par rôle
   */
  private getSignatureByRole(returnDoc: ReturnDocument, role: SignerRole) {
    switch (role) {
      case SignerRole.EMPLOYEE:
        return returnDoc.signatureDataEmployee;
      case SignerRole.IT:
        return returnDoc.signatureDataIT;
      case SignerRole.HR:
        return returnDoc.signatureDataHR;
      default:
        return null;
    }
  }
}

