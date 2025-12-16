import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../database/schemas/user.schema';
import { GraphService } from '../auth/services/graph.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SearchEmployeeDto } from './dto/search-employee.dto';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private graphService: GraphService,
  ) {}

  /**
   * Créer ou mettre à jour un employé depuis les données Office 365
   * Les employés ne peuvent être créés que via la synchronisation Office 365
   */
  async createOrUpdateFromGraph(graphUser: any, accessToken?: string): Promise<UserDocument> {
    // Utiliser userPrincipalName comme identifiant unique Office 365
    const office365Id = graphUser.userPrincipalName || graphUser.id;
    
    if (!office365Id) {
      throw new BadRequestException('userPrincipalName ou id manquant dans les données Graph');
    }

    // Préparer les données depuis Graph API avec toutes les propriétés disponibles
    // Référence: https://learn.microsoft.com/fr-fr/graph/api/resources/users
    const employeeData: any = {
      office365Id: office365Id,
      email: graphUser.mail || graphUser.userPrincipalName,
      displayName: graphUser.displayName || '',
      givenName: graphUser.givenName,
      surname: graphUser.surname,
      jobTitle: graphUser.jobTitle,
      department: graphUser.department,
      officeLocation: graphUser.officeLocation,
      mobilePhone: graphUser.mobilePhone || graphUser.businessPhones?.[0],
      officePhone: graphUser.officePhone,
      businessPhones: graphUser.businessPhones,
      city: graphUser.city,
      country: graphUser.country,
      postalCode: graphUser.postalCode,
      streetAddress: graphUser.streetAddress,
      state: graphUser.state,
      companyName: graphUser.companyName,
      employeeId: graphUser.employeeId,
      employeeType: graphUser.employeeType,
      employeeHireDate: graphUser.employeeHireDate ? new Date(graphUser.employeeHireDate) : undefined,
      preferredLanguage: graphUser.preferredLanguage,
      usageLocation: graphUser.usageLocation,
      userType: graphUser.userType,
      accountEnabled: graphUser.accountEnabled !== false,
      isActive: graphUser.accountEnabled !== false, // Par défaut actif sauf si explicitement désactivé
      officeName: graphUser.officeName,
      division: graphUser.division,
      costCenter: graphUser.costCenter,
      employeeOrgData: graphUser.employeeOrgData,
      onPremisesExtensionAttributes: graphUser.onPremisesExtensionAttributes,
      businessUnit: graphUser.businessUnit,
      employeeNumber: graphUser.employeeNumber,
      lastSync: new Date(),
    };

    // Gérer le manager si disponible
    if (graphUser.manager) {
      employeeData.managerId = graphUser.manager.id || graphUser.manager.userPrincipalName;
      employeeData.managerDisplayName = graphUser.manager.displayName;
      employeeData.managerEmail = graphUser.manager.mail || graphUser.manager.userPrincipalName;
    }

    // Chercher l'employé existant par office365Id (identifiant unique)
    const existingEmployee = await this.userModel.findOne({
      office365Id: employeeData.office365Id,
    });

        // Récupérer la photo de profil si un token est fourni
        if (accessToken && graphUser.id) {
          try {
            const photo = await this.graphService.getUserPhoto(accessToken, graphUser.id);
            if (photo) {
              employeeData.profilePicture = photo;
              // Stocker aussi l'URL de la photo Graph API
              employeeData.profilePictureUrl = `https://graph.microsoft.com/v1.0/users/${graphUser.id}/photo/$value`;
            }
          } catch (error: any) {
            // La photo peut ne pas exister, ce n'est pas une erreur critique
            this.logger.debug(`   Photo non disponible pour ${graphUser.userPrincipalName}`);
          }
        }

    if (existingEmployee) {
      // Mettre à jour avec les nouvelles données depuis Office 365
      Object.assign(existingEmployee, employeeData);
      return existingEmployee.save();
    } else {
      // Créer uniquement depuis Office 365 (pas de création manuelle)
      const newEmployee = new this.userModel(employeeData);
      return newEmployee.save();
    }
  }

  /**
   * Synchroniser tous les utilisateurs depuis Office 365
   * Référence API: https://graph.microsoft.com/v1.0/users
   * Documentation: https://learn.microsoft.com/fr-fr/graph/api/resources/users
   */
  async syncFromOffice365(accessToken: string): Promise<{ synced: number; errors: number; skipped: number }> {
    this.logger.log('🔄 Début de la synchronisation Office 365...');
    this.logger.log('   Endpoint: https://graph.microsoft.com/v1.0/users');

    let synced = 0;
    let errors = 0;
    let skipped = 0;
    let nextLink: string | null = null;

    try {
      do {
        // Sélectionner TOUTES les propriétés disponibles selon la documentation Graph API
        // Référence: https://learn.microsoft.com/fr-fr/graph/api/resources/users
        const baseUrl = 'https://graph.microsoft.com/v1.0/users';
        const selectParams = [
          'id',
          'displayName',
          'mail',
          'userPrincipalName',
          'givenName',
          'surname',
          'jobTitle',
          'department',
          'officeLocation',
          'mobilePhone',
          'businessPhones',
          'officePhone',
          'city',
          'country',
          'postalCode',
          'streetAddress',
          'state',
          'companyName',
          'employeeId',
          'employeeType',
          'employeeHireDate',
          'preferredLanguage',
          'usageLocation',
          'userType',
          'accountEnabled',
          'officeName',
          'division',
          'costCenter',
          'employeeOrgData',
          'onPremisesExtensionAttributes',
          'businessUnit',
          'employeeNumber',
        ].join(',');
        
        const url = nextLink || `${baseUrl}?$select=${selectParams}&$expand=manager($select=id,displayName,userPrincipalName)&$top=999`;
        
        this.logger.debug(`   Requête: ${url.replace(accessToken.substring(0, 20), '***')}`);
        
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Erreur Graph API: ${response.status} ${response.statusText}`);
          this.logger.error(`   Détails: ${errorText}`);
          throw new BadRequestException(`Erreur Graph API: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const users = data.value || [];

        this.logger.log(`   ${users.length} utilisateurs récupérés dans ce lot`);

        // Traiter chaque utilisateur
        for (const graphUser of users) {
          try {
            // Ignorer les comptes invités B2B (identifiés par #EXT# dans userPrincipalName)
            if (graphUser.userPrincipalName?.includes('#EXT#')) {
              skipped++;
              continue;
            }

            // Ignorer les comptes système (onmicrosoft.com sans mail principal)
            if (!graphUser.mail && graphUser.userPrincipalName?.includes('onmicrosoft.com')) {
              skipped++;
              continue;
            }

            // Vérifier que l'utilisateur a au moins un identifiant
            if (!graphUser.userPrincipalName && !graphUser.id) {
              this.logger.warn(`   Utilisateur ignoré: pas d'identifiant valide`);
              skipped++;
              continue;
            }

            await this.createOrUpdateFromGraph(graphUser, accessToken);
            synced++;
          } catch (error: any) {
            this.logger.error(`   Erreur lors de la synchronisation de ${graphUser.userPrincipalName || graphUser.id}:`, error.message);
            errors++;
          }
        }

        // Gérer la pagination
        nextLink = data['@odata.nextLink'] || null;
        if (nextLink) {
          this.logger.log(`   Pagination: récupération du lot suivant...`);
        }
      } while (nextLink);

      this.logger.log(`✅ Synchronisation terminée:`);
      this.logger.log(`   - ${synced} utilisateurs synchronisés`);
      this.logger.log(`   - ${skipped} utilisateurs ignorés (invités/système)`);
      this.logger.log(`   - ${errors} erreurs`);
      
      return { synced, errors, skipped };
    } catch (error: any) {
      this.logger.error('❌ Erreur lors de la synchronisation Office 365:', error);
      throw error;
    }
  }

  /**
   * Rechercher des employés avec filtres et pagination
   */
  async search(searchDto: SearchEmployeeDto) {
    const { query, department, officeLocation, isActive, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;

    // Construire le filtre
    const filter: any = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    if (department) {
      filter.department = { $regex: department, $options: 'i' };
    }

    if (officeLocation) {
      filter.officeLocation = { $regex: officeLocation, $options: 'i' };
    }

    // Recherche textuelle (nom, prénom, email, office365Id/userPrincipalName)
    if (query) {
      filter.$or = [
        { displayName: { $regex: query, $options: 'i' } },
        { givenName: { $regex: query, $options: 'i' } },
        { surname: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { office365Id: { $regex: query, $options: 'i' } }, // Ajout de la recherche par userPrincipalName
        { department: { $regex: query, $options: 'i' } },
      ];
    }

    // Log pour le débogage
    this.logger.debug(`🔍 Recherche d'employés:`, {
      query,
      filter: JSON.stringify(filter),
      page,
      limit,
    });

    // Exécuter la requête
    const [employees, total] = await Promise.all([
      this.userModel.find(filter).skip(skip).limit(limit).sort({ displayName: 1 }).exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    this.logger.debug(`📊 Résultats de recherche: ${total} employé(s) trouvé(s)`);

    return {
      data: employees,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtenir tous les employés
   */
  async findAll(): Promise<UserDocument[]> {
    const employees = await this.userModel.find({ isActive: true }).sort({ displayName: 1 }).exec();
    this.logger.debug(`📋 Liste complète: ${employees.length} employé(s) actif(s)`);
    return employees;
  }

  /**
   * Obtenir un employé par ID
   */
  async findOne(id: string): Promise<UserDocument> {
    const employee = await this.userModel.findById(id).exec();
    if (!employee) {
      throw new NotFoundException(`Employé avec l'ID ${id} non trouvé`);
    }
    return employee;
  }

  /**
   * Obtenir un employé par Office 365 ID
   */
  async findByOffice365Id(office365Id: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ office365Id }).exec();
  }

  /**
   * Obtenir un employé par email
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  /**
   * Mettre à jour un employé
   * Note: Les mises à jour manuelles sont limitées. Pour une synchronisation complète, utiliser syncFromOffice365
   */
  async update(id: string, updateDto: UpdateEmployeeDto): Promise<UserDocument> {
    const employee = await this.findOne(id);
    
    // Ne pas permettre la modification de l'office365Id (identifiant unique Office 365)
    if (updateDto.office365Id && updateDto.office365Id !== employee.office365Id) {
      throw new BadRequestException('Impossible de modifier l\'identifiant Office 365. Utilisez la synchronisation pour mettre à jour depuis Office 365.');
    }
    
    Object.assign(employee, updateDto);
    return employee.save();
  }

  /**
   * Désactiver un employé (soft delete)
   */
  async deactivate(id: string): Promise<UserDocument> {
    const employee = await this.findOne(id);
    employee.isActive = false;
    return employee.save();
  }

  /**
   * Obtenir les statistiques des employés
   */
  async getStats() {
    const [total, active, inactive, byDepartment] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.userModel.countDocuments({ isActive: true }).exec(),
      this.userModel.countDocuments({ isActive: false }).exec(),
      this.userModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).exec(),
    ]);

    return {
      total,
      active,
      inactive,
      byDepartment,
    };
  }
}

