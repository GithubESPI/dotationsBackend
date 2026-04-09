import { Injectable, Logger, BadRequestException, NotFoundException, Inject, forwardRef, Optional } from '@nestjs/common';
import { AllocationsService } from '../allocations/allocations.service';
import { PdfGeneratorService } from '../pdf-generator/pdf-generator.service';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { Equipment, EquipmentDocument, EquipmentStatus, EquipmentType } from '../database/schemas/equipment.schema';
import { User, UserDocument } from '../database/schemas/user.schema';
import { Allocation, AllocationDocument } from '../database/schemas/allocation.schema';
import {
  JIRA_EQUIPMENT_TYPE_MAPPING,
  REFERENCE_OBJECT_TYPES,
  isEquipmentType,
  isReferenceType,
  getEquipmentType,
  getAllEquipmentTypeNames
} from './equipment-type-mapping';

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
  label?: string;   // Nom affiché (ex: "Alice CARTIER"), retourné par l'API Jira Assets
  objectTypeId: string;
  objectType: {
    id: string;
    name: string;
  };
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

  // Verrou de déduplication en mémoire : clé = nom normalisé
  // Empêche 2 appels parallèles de créer le même utilisateur Asset simultanément
  private readonly userCreationLocks = new Map<string, Promise<JiraAssetObjectResponse | null>>();

  // Cache court terme des utilisateurs Asset trouvés (TTL 60 secondes)
  private readonly userCache = new Map<string, { user: JiraAssetObjectResponse; expiresAt: number }>();
  private readonly USER_CACHE_TTL_MS = 60_000; // 60 secondes

  // ============================================================
  // Registre global de TOUS les users Jira chargés en mémoire
  // Clé = nom normalisé (minuscules, sans espaces) pour comparaison JS insensible à la casse
  // Chargé UNE SEULE FOIS par session de synchro, élimine 100% les race conditions et
  // les problèmes de sensibilité à la casse des requêtes AQL Jira
  // ============================================================
  private userRegistry = new Map<string, JiraAssetObjectResponse>();
  private userRegistryLoadedAt: number = 0;
  private readonly USER_REGISTRY_TTL_MS = 10 * 60_000; // 10 minutes (doublé pour plus de stabilité)
  
  // ID de l'attribut Email dans le type d'objet "Users" (détecté au chargement du registre)
  private userEmailAttrId: string | null = null;
  private userNameAttrId: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(Equipment.name) private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Allocation.name) private allocationModel: Model<AllocationDocument>,
    @Optional() @Inject(forwardRef(() => AllocationsService)) private readonly allocationsService?: AllocationsService,
    @Optional() private readonly pdfGeneratorService?: PdfGeneratorService,
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
   * Construire les headers d'authentification pour Jira Assets
   */
  private getAuthHeaders(): any {
    return {
      Authorization: `Basic ${Buffer.from(`${this.emailAssets}:${this.apiTokenAssets.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Charger TOUS les utilisateurs Jira Assets en mémoire une seule fois.
   * Construit un registre indexé par nom normalisé (minuscules, sans espaces)
   * pour une comparaison JavaScript fiable et insensible à la casse.
   */
  async loadUserRegistry(): Promise<void> {
    const now = Date.now();
    if (this.userRegistryLoadedAt > 0 && (now - this.userRegistryLoadedAt) < this.USER_REGISTRY_TTL_MS) {
      this.logger.log(`📦 Registre utilisateurs déjà chargé (${this.userRegistry.size} users, valide encore ${Math.round((this.USER_REGISTRY_TTL_MS - (now - this.userRegistryLoadedAt)) / 1000)}s)`);
      return;
    }

    this.logger.log(`🔄 Chargement du registre global des utilisateurs Jira Assets...`);
    try {
      const searchUrl = this.buildAssetsUrl('object/aql');
      const allUsers: JiraAssetObjectResponse[] = [];
      let startAt = 0;
      const pageSize = 100;

      while (true) {
        const response = await firstValueFrom(
          this.httpService.post<{ values: JiraAssetObjectResponse[]; total?: number; isLast?: boolean }>(
            searchUrl,
            { qlQuery: `objectType = "Users"`, maxResults: pageSize, startAt, includeAttributes: true },
            { headers: this.getAuthHeaders() },
          ),
        );
        const page = response.data.values || [];
        allUsers.push(...page);
        
        // CORRECTION: Ne pas se fier uniquement à page.length < pageSize car l'index Jira peut être instable
        if (page.length === 0 || response.data.isLast === true) break;
        
        startAt += pageSize;
        // Sécurité pour éviter les boucles infinies si startAt ne progresse pas
        if (startAt > 5000) break; 
      }
      this.userRegistry.clear();
      
      // 1. Détecter dynamiquement les IDs d'attributs Email/Nom pour le type "Users"
      const schemaId = await this.getObjectSchemaId('Parc Informatique');
      if (schemaId) {
        const objectTypes = await this.getAllObjectTypes(schemaId);
        const userOt = objectTypes.find(ot => ot.name === 'Users');
        if (userOt) {
          const attributesDefinition = await this.getObjectTypeAttributesDetails('Users', 'Parc Informatique');
          const findAttr = (names: string[]) => attributesDefinition.find(a => names.includes(a.name.toLowerCase()));
          this.userEmailAttrId = findAttr(['email', 'e-mail', 'mail'])?.id || null;
          this.userNameAttrId = findAttr(['nom complet', 'name', 'nom'])?.id || null;
          this.logger.debug(`🎯 Attributs détectés pour "Users": Email=${this.userEmailAttrId}, Nom=${this.userNameAttrId}`);
        }
      }

      // 2. Indexer les utilisateurs
      for (const u of allUsers) {
        // Indexer par ID technique Jira
        this.userRegistry.set(u.id, u);
        
        // Indexer par Label (Nom affiché)
        const rawLabel: string = (u as any).label || '';
        if (rawLabel && rawLabel.trim().length > 1) {
          const k = rawLabel.replace(/\s+/g, '').toLowerCase();
          if (!this.userRegistry.has(k)) this.userRegistry.set(k, u);
        }

        // Indexer par attributs (Email, etc.)
        for (const attr of u.attributes || []) {
          const val = attr.objectAttributeValues?.[0]?.value;
          if (val && typeof val === 'string' && val.trim().length > 1) {
            const k = val.replace(/\s+/g, '').toLowerCase();
            
            // Si c'est l'attribut email, on indexe TRÈS proprement
            if (attr.objectTypeAttributeId === this.userEmailAttrId) {
              const emailKey = val.trim().toLowerCase();
              this.userRegistry.set(emailKey, u);
            }
            
            if (!this.userRegistry.has(k)) this.userRegistry.set(k, u);
            
            // Indexer aussi les parties du nom (pour matching partiel)
            if (attr.objectTypeAttributeId === this.userNameAttrId) {
              val.split(' ').forEach(part => {
                const pk = part.toLowerCase().trim();
                if (pk.length > 2 && !this.userRegistry.has(pk)) {
                  this.userRegistry.set(pk, u);
                }
              });
            }
          }
        }
      }

      this.userRegistryLoadedAt = Date.now();
      this.logger.log(`✅ Registre chargé: ${this.userRegistry.size} entrées pour ${allUsers.length} utilisateurs`);
    } catch (err: any) {
      this.logger.error(`❌ Erreur chargement registre utilisateurs: ${err.message}`);
      // Ne pas bloquer la synchro si le registre est temporairement inaccessible
    }
  }

  /**
   * Invalider le registre (utilisé après une création d'utilisateur)
   */
  private invalidateUserRegistry(): void {
    this.userRegistryLoadedAt = 0;
    this.userCache.clear();
  }

  /**
   * Rechercher un objet Utilisateur dans Jira Assets par Nom Complet
   * Utilise le registre en mémoire (chargé une fois par synchro) pour une
   * comparaison JS insensible à la casse et aux espaces.
   */
  async findAssetUserByEmail(email: string, displayName?: string): Promise<JiraAssetObjectResponse | null> {
    const normalizedDisplayName = displayName?.replace(/\s+/g, ' ').trim();
    
    if (!normalizedDisplayName && !email) return null;

    // Clé de recherche = nom sans espaces, minuscules
    const searchKey = email
      ? email.trim().toLowerCase()
      : (normalizedDisplayName ? normalizedDisplayName.replace(/\s+/g, '').toLowerCase() : '');

    // 1. Vérifier le cache court terme d'abord
    const cached = this.userCache.get(searchKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`📦 Utilisateur trouvé en cache: "${normalizedDisplayName}" (ID: ${cached.user.id})`);
      return cached.user;
    }

    // 2. Vérifier le registre global (comparaison JS, insensible à la casse)
    if (this.userRegistry.size > 0) {
      // 2a. Correspondance exacte (nom complet sans espaces)
      let fromRegistry = this.userRegistry.get(searchKey);

      // 2b. Si pas trouvé, essayer les variantes partielles
      // Cas : Jira stocke "ADA" mais O365 envoie "ADA DUPONT" → on cherche chaque partie
      if (!fromRegistry && normalizedDisplayName) {
        const parts = normalizedDisplayName.split(' ');

        // Chercher chaque partie individuelle (nom seul, prénom seul)
        for (const part of parts) {
          const partKey = part.replace(/\s+/g, '').toLowerCase(); // FIX: corrected regex from \\s+ to \s+
          if (partKey.length > 2) {
            const candidate = this.userRegistry.get(partKey);
            if (candidate) {
              this.logger.debug(`📊 Match partiel "${part}" → "${normalizedDisplayName}" (ID: ${candidate.id})`);
              fromRegistry = candidate;
              break;
            }
          }
        }

        // Chercher par suffixe (ex: "Prenom NOM" → clé "NOM" seul)
        if (!fromRegistry && parts.length > 1) {
          for (let i = 1; i < parts.length; i++) {
            const combo = parts.slice(i).join('').toLowerCase();
            const candidate = this.userRegistry.get(combo);
            if (candidate) {
              this.logger.debug(`📊 Match suffixe "${parts.slice(i).join(' ')}" → "${normalizedDisplayName}" (ID: ${candidate.id})`);
              fromRegistry = candidate;
              break;
            }
          }
        }
      }

      if (fromRegistry) {
        this.userCache.set(searchKey, { user: fromRegistry, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
        return fromRegistry;
      }
    }

    // 3. Fallback : Non trouvé dans le registre ou registre non chargé → requête AQL directe
    // C'est nécessaire car l'index global de Jira Assets peut être incomplet.
    this.logger.debug(`🔍 Recherche AQL temps réel pour: "${email || normalizedDisplayName}"`);
    const objectTypeName = 'Users';
    try {
      const queryParts: string[] = [];
      if (email) {
        // Utiliser l'ID d'attribut email détecté s'il existe
        if (this.userEmailAttrId) {
          queryParts.push(`"${this.userEmailAttrId}" = "${email}"`);
        } else {
          queryParts.push(`"Email" = "${email}"`);
          queryParts.push(`"E-mail" = "${email}"`);
          queryParts.push(`"mail" = "${email}"`);
        }
      }
      if (normalizedDisplayName) {
        if (this.userNameAttrId) {
          queryParts.push(`"${this.userNameAttrId}" = "${normalizedDisplayName}"`);
        } else {
          queryParts.push(`"Name" = "${normalizedDisplayName}"`);
          queryParts.push(`"Nom Complet" = "${normalizedDisplayName}"`);
        }
        const wildcardName = normalizedDisplayName.replace(/\s+/g, '%');
        queryParts.push(`"Name" LIKE "%${wildcardName}%"`);
      }
      if (queryParts.length === 0) return null;

      const query = `objectType = "${objectTypeName}" AND (${queryParts.join(' OR ')})`;
      const results = await this.searchAssetsInJira(objectTypeName, query, 10);

      if (results.length > 0) {
        const bestMatch = results.sort((a, b) => parseInt(a.id) - parseInt(b.id))[0];
        this.userCache.set(searchKey, { user: bestMatch, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
        return bestMatch;
      }
      return null;
    } catch (error: any) {
      this.logger.error(`❌ Erreur recherche utilisateur "${normalizedDisplayName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Créer un objet Utilisateur dans Jira Assets (avec verrou et cache)
   */
  async createAssetUser(user: { email: string; firstName: string; lastName: string; displayName: string }): Promise<JiraAssetObjectResponse | null> {
    // Clé unique basée sur le NOM COMPLET normalisé (sans espaces, minuscules)
    // C'est la seule donnée fiable : Jira n'a pas de champ email
    const normalizedDisplayName = user.displayName?.replace(/\s+/g, ' ').trim();
    const lockKey = user.email?.trim().toLowerCase() || normalizedDisplayName?.replace(/\s+/g, '').toLowerCase() || 'unknown';

    // 1. Vérifier le cache d'abord (résultat immédiat, pas d'appel API)
    const cached = this.userCache.get(lockKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`📦 Utilisateur trouvé en cache (createAssetUser): ${lockKey}`);
      return cached.user;
    }

    // 2. Si une création est déjà en cours pour cet utilisateur (race condition entre Promise.all),
    //    on attend le résultat de cette création au lieu d'en lancer une nouvelle.
    if (this.userCreationLocks.has(lockKey)) {
      this.logger.warn(`🔒 Création déjà en cours pour "${lockKey}", attente du résultat existant...`);
      return this.userCreationLocks.get(lockKey)!;
    }

    const creationPromise = this._doCreateAssetUser(user, normalizedDisplayName, user.email?.trim().toLowerCase(), lockKey);
    this.userCreationLocks.set(lockKey, creationPromise);

    try {
      return await creationPromise;
    } finally {
      // Libérer le verrou dès que la promesse est résolue (succès ou erreur)
      this.userCreationLocks.delete(lockKey);
    }
  }

  /**
   * Logique interne de création d'utilisateur Asset - ne jamais appeler directement
   */
  private async _doCreateAssetUser(
    user: { email: string; firstName: string; lastName: string; displayName: string },
    normalizedDisplayName: string | undefined,
    normalizedEmail: string | undefined,
    lockKey: string
  ): Promise<JiraAssetObjectResponse | null> {
    // SÉCURITÉ 1 : Revérification via le mécanisme robuste de findAssetUserByEmail
    // C'est le seul endroit où l'on garantit qu'on ne duplique pas (l'AQL échoue à cause du labeling "Nom").
    const doubleCheck = await this.findAssetUserByEmail(user.email, user.displayName || normalizedDisplayName);
    if (doubleCheck) {
      this.logger.log(`ℹ️ Utilisateur Asset double-checké en mémoire: "${lockKey}" (ID: ${doubleCheck.id}), création annulée.`);
      this.userCache.set(lockKey, { user: doubleCheck, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
      return doubleCheck;
    }
    // SÉCURITÉ 2 : Créer l'utilisateur
    try {
      this.logger.log(`👤 Création de l'utilisateur Asset: ${user.email} (${normalizedDisplayName})`);
      const schemaName = 'Parc Informatique';
      const objectTypeName = 'Users';

      // ID du type d'objet
      const schemaId = await this.getObjectSchemaId(schemaName);
      const objectTypes = await this.getAllObjectTypes(schemaId!);
      const objectType = objectTypes.find(ot => ot.name === objectTypeName);

      if (!objectType) throw new Error(`Type d'objet "${objectTypeName}" non trouvé`);

      const attributesDefinition = await this.getObjectTypeAttributesDetails(objectTypeName, schemaName);
      const attributesToCreate: any[] = [];
      const findAttr = (names: string[]) => attributesDefinition.find(a => names.includes(a.name.toLowerCase()));

      const nomAttr = findAttr(['nom', 'lastname', 'surname', 'name']);
      const prenomsAttr = findAttr(['prenoms', 'prénoms', 'firstname', 'givenname', 'prenom']);
      const emailAttr = findAttr(['email', 'e-mail', 'mail']);

      if (nomAttr && nomAttr.type !== 2) {
        attributesToCreate.push({ objectTypeAttributeId: nomAttr.id, objectAttributeValues: [{ value: user.lastName || normalizedDisplayName }] });
      }
      if (prenomsAttr && prenomsAttr.type !== 2) {
        attributesToCreate.push({ objectTypeAttributeId: prenomsAttr.id, objectAttributeValues: [{ value: user.firstName }] });
      }
      if (emailAttr && emailAttr.type !== 2) {
        attributesToCreate.push({ objectTypeAttributeId: emailAttr.id, objectAttributeValues: [{ value: user.email }] });
      }

      const nameAttr = attributesDefinition.find(a => a.name === 'Name' || a.name === 'Nom Complet');
      if (nameAttr && !attributesToCreate.find(a => a.objectTypeAttributeId === nameAttr.id)) {
        attributesToCreate.push({ objectTypeAttributeId: nameAttr.id, objectAttributeValues: [{ value: normalizedDisplayName }] });
      }

      const result = await this.createAssetInJira(objectType.id, attributesToCreate);
      this.logger.log(`✅ Utilisateur Asset créé avec succès: ${result.objectKey} (ID: ${result.id})`);
      // Mettre en cache ET dans le registre le nouvel utilisateur créé
      this.userCache.set(lockKey, { user: result, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
      // Ajouter au registre existant au lieu de l'invalider (plus efficace)
      this.userRegistry.set(lockKey, result);
      return result;
    } catch (error: any) {
      this.logger.error(`❌ Impossible de créer l'utilisateur Asset ${user.email}: ${error.message}`);
      return null;
    }
  }

  /**
   * Rechercher un utilisateur Jira par email (Legacy)
   * ... conservation de l'ancienne méthode au cas où ...
   */
  async findJiraUserByEmail(email: string): Promise<string | null> {
    try {
      // Utiliser l'API Jira standard (pas Assets) pour rechercher l'utilisateur
      const searchUrl = `${this.baseUrl}/rest/api/3/user/search`;

      const response = await firstValueFrom(
        this.httpService.get(searchUrl, {
          params: { query: email },
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
            Accept: 'application/json'
          }
        })
      );

      if (response.data && response.data.length > 0) {
        // On prend le premier utilisateur actif trouvé
        const user = response.data.find((u: any) => u.accountType === 'atlassian' && u.active);
        return user ? user.accountId : response.data[0].accountId;
      }

      return null;
    } catch (error: any) {
      this.logger.warn(`⚠️ Erreur lors de la recherche de l'utilisateur Jira ${email}: ${error.message}`);
      return null;
    }
  }

  /**
   * Créer un utilisateur Jira (ou inviter)
   * Note: Cette méthode peut nécessiter des droits d'administration
   */
  async createJiraUser(email: string, displayName: string): Promise<string | null> {
    try {
      this.logger.log(`👤 Tentative de création de l'utilisateur Jira: ${email}`);
      const createUrl = `${this.baseUrl}/rest/api/3/user`;

      const response = await firstValueFrom(
        this.httpService.post(createUrl,
          {
            emailAddress: email,
            displayName: displayName,
            // products: ['jira-software'] // Optionnel
          },
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken.replace(/^["']|["']$/g, '')}`).toString('base64')}`,
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          }
        )
      );

      if (response.data && response.data.accountId) {
        this.logger.log(`✅ Utilisateur Jira créé: ${response.data.accountId}`);
        return response.data.accountId;
      }

      return null;
    } catch (error: any) {
      this.logger.warn(`⚠️ Impossible de créer l'utilisateur Jira ${email}: ${error.message}`);
      if (error.response?.data) {
        this.logger.warn(`Détails: ${JSON.stringify(error.response.data)}`);
      }
      return null;
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
            headers: this.getAuthHeaders(),
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
   * Récupérer l'ID d'un schéma d'objets par son nom
   */
  async getObjectSchemaId(schemaName: string): Promise<string | null> {
    try {
      const workspaceId = await this.getWorkspaceId();
      // Endpoint pour lister les schémas: /objectschema/list
      const url = this.buildAssetsUrl('objectschema/list');

      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.getAuthHeaders() }).pipe(
          map((res) => res.data),
        ),
      );

      if (response && response.values) {
        const schema = response.values.find((s: any) => s.name === schemaName);
        if (!schema) {
          this.logger.warn(`⚠️ Schéma "${schemaName}" non trouvé. Schémas disponibles: ${response.values.map((s: any) => `"${s.name}" (ID:${s.id})`).join(', ')}`);
        }
        return schema ? schema.id : null;
      }
      return null;
    } catch (error: any) {
      this.logger.warn(`⚠️ Erreur lors de la récupération du schéma ${schemaName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Récupérer tous les types d'objets d'un schéma
   */
  async getAllObjectTypes(schemaId: string): Promise<any[]> {
    try {
      // Endpoint pour lister les types d'objets: /objectschema/{id}/objecttypes
      const url = this.buildAssetsUrl(`objectschema/${schemaId}/objecttypes`); // Correction de l'endpoint

      const response = await firstValueFrom( // Utilisation correcte de firstValueFrom
        this.httpService.get(url, { headers: this.getAuthHeaders() }).pipe(
          map((res) => res.data),
        ),
      );

      return response || [];
    } catch (error: any) {
      this.logger.warn(`⚠️ Erreur lors de la récupération des types d'objets pour le schéma ${schemaId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Récupérer tous les objets d'un schéma spécifique via AQL (Asset Query Language)
   * @param schemaName Nom du schéma (ex: "Parc Informatique")
   * @param limit Limite du nombre d'objets à récupérer (défaut: 1000)
   */
  async getAllAssetsFromSchema(schemaName: string, limit: number = 1000): Promise<JiraAssetObjectResponse[]> {
    const workspaceId = await this.getWorkspaceId();
    let allAssets: JiraAssetObjectResponse[] = [];
    let start = 0;
    const pageSize = 100; // Taille de page recommandée pour l'API

    try {
      this.logger.log(`🔍 Récupération des objets du schéma "${schemaName}"...`);

      // Construire l'URL en utilisant JIRA_BASE_URL_ASSETS et JIRA_BASE_PATH_ASSETS si disponible
      // L'endpoint correct est /object/aql (pas /aql/objects)
      const searchUrl = this.buildAssetsUrl('object/aql');

      // Map pour suivre les IDs uniques et éviter les doublons
      const uniqueAssetsMap = new Map<string, JiraAssetObjectResponse>();

      while (true) {
        const aqlBody = {
          qlQuery: `objectSchema = "${schemaName}"`,
        };
        // Construire l'URL avec les paramètres de pagination
        const paginatedUrl = `${searchUrl}?startAt=${start}&maxResults=${pageSize}&includeAttributes=true`;

        this.logger.debug(`   🔍 Requête AQL: URL=${paginatedUrl}`);

        const response = await firstValueFrom(
          this.httpService.post<{ values: JiraAssetObjectResponse[]; size: number; start: number; limit: number; isLast?: boolean; total?: number }>(
            paginatedUrl,
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

        // Filtrer et ajouter uniquement les nouveaux objets (déduplication par ID)
        let newAssetsCount = 0;
        for (const asset of assets) {
          if (!uniqueAssetsMap.has(asset.id)) {
            uniqueAssetsMap.set(asset.id, asset);
            newAssetsCount++;
          }
        }

        const pageNum = Math.floor(start / pageSize) + 1;
        this.logger.log(`📦 Page ${pageNum}: ${assets.length} objets reçus, ${newAssetsCount} nouveaux (total unique: ${uniqueAssetsMap.size})`);

        // Vérifier s'il y a plus de résultats
        const hasMore = newAssetsCount > 0 && uniqueAssetsMap.size < limit && assets.length > 0;

        if (!hasMore) {
          if (assets.length === 0) {
            this.logger.log(`✅ Pagination terminée: aucune donnée supplémentaire disponible`);
          } else if (newAssetsCount === 0) {
            this.logger.log(`✅ Pagination terminée: aucun nouvel objet unique trouvé`);
          } else if (uniqueAssetsMap.size >= limit) {
            this.logger.log(`✅ Pagination terminée: limite atteinte (${uniqueAssetsMap.size}/${limit})`);
          }
          break;
        }

        start += pageSize;
        this.logger.log(`   ⏭️ Récupération de la page suivante (startAt=${start})...`);
      }

      // Convertir la Map en tableau
      allAssets = Array.from(uniqueAssetsMap.values());

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
   * Récupérer tous les objets d'un type d'objet spécifique dans un schéma
   * @param schemaName Nom du schéma (ex: "Parc Informatique")
   * @param objectTypeName Nom du type d'objet (ex: "Laptop")
   * @param limit Limite du nombre d'objets à récupérer (défaut: 1000)
   */
  async getAllAssetsByObjectType(
    schemaName: string,
    objectTypeName: string,
    limit: number = 1000,
  ): Promise<JiraAssetObjectResponse[]> {
    let allAssets: JiraAssetObjectResponse[] = [];
    let start = 0;
    const pageSize = 100; // Taille de page recommandée pour l'API

    try {
      this.logger.log(`🔍 Récupération des objets de type "${objectTypeName}" du schéma "${schemaName}"...`);

      // Construire l'URL en utilisant JIRA_BASE_URL_ASSETS et JIRA_BASE_PATH_ASSETS si disponible
      const searchUrl = this.buildAssetsUrl('object/aql');

      // Map pour suivre les IDs uniques et éviter les doublons
      const uniqueAssetsMap = new Map<string, JiraAssetObjectResponse>();

      while (true) {
        // Requête AQL pour filtrer par schéma ET type d'objet
        // IMPORTANT: Utiliser startAt et maxResults au lieu de page et resultPerPage
        const aqlBody = {
          qlQuery: `objectSchema = "${schemaName}" AND objectType = "${objectTypeName}"`,
        };
        // Construire l'URL avec les paramètres de pagination
        const paginatedUrl = `${searchUrl}?startAt=${start}&maxResults=${pageSize}&includeAttributes=true`;

        this.logger.debug(`   🔍 Requête AQL: startAt=${start}, maxResults=${pageSize}`);

        const response = await firstValueFrom(
          this.httpService.post<{ values: JiraAssetObjectResponse[]; size: number; start: number; limit: number; total?: number; isLast?: boolean }>(
            paginatedUrl,
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

        // Filtrer et ajouter uniquement les nouveaux objets (déduplication par ID)
        let newAssetsCount = 0;
        for (const asset of assets) {
          if (!uniqueAssetsMap.has(asset.id)) {
            uniqueAssetsMap.set(asset.id, asset);
            newAssetsCount++;
          }
        }

        const pageNum = Math.floor(start / pageSize) + 1;
        this.logger.log(`📦 Page ${pageNum}: ${assets.length} objets reçus, ${newAssetsCount} nouveaux (total unique: ${uniqueAssetsMap.size})`);

        // Log de débogage pour vérifier les doublons
        if (newAssetsCount < assets.length) {
          this.logger.warn(`   ⚠️ ${assets.length - newAssetsCount} doublons détectés sur cette page`);
        }

        // Vérifier s'il y a plus de résultats
        // On arrête si:
        // - Aucun nouvel objet unique n'a été ajouté
        // - OU on a atteint la limite demandée
        // - OU la page est vide
        const hasMore = newAssetsCount > 0 && uniqueAssetsMap.size < limit && assets.length > 0;

        if (!hasMore) {
          if (assets.length === 0) {
            this.logger.log(`✅ Pagination terminée: aucune donnée supplémentaire disponible`);
          } else if (newAssetsCount === 0) {
            this.logger.log(`✅ Pagination terminée: aucun nouvel objet unique trouvé`);
          } else if (uniqueAssetsMap.size >= limit) {
            this.logger.log(`✅ Pagination terminée: limite atteinte (${uniqueAssetsMap.size}/${limit})`);
          }
          break;
        }

        // Continuer avec la pagination
        start += pageSize;
        this.logger.log(`   ⏭️ Récupération de la page suivante (startAt=${start})...`);
      }

      // Convertir la Map en tableau
      allAssets = Array.from(uniqueAssetsMap.values());

      this.logger.log(`✅ ${allAssets.length} objets de type "${objectTypeName}" récupérés du schéma "${schemaName}"`);
      return allAssets.slice(0, limit); // Limiter au nombre demandé
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la récupération des objets de type "${objectTypeName}" du schéma "${schemaName}": ${error.message}`);
      if (error.response) {
        this.logger.error(`Détails: ${JSON.stringify(error.response.data)}`);
      }
      throw new BadRequestException(`Impossible de récupérer les objets de type "${objectTypeName}" du schéma "${schemaName}": ${error.message}`);
    }
  }

  /**
   * Détecter automatiquement les IDs d'attributs depuis un objet Jira Asset
   * Cherche les attributs par leurs noms (via map) ou valeurs/labels communs
   */
  private detectAttributeIds(
    jiraAsset: JiraAssetObjectResponse,
    attributesDefinitionMap?: Record<string, string>
  ): {
    serialNumberAttrId?: string;
    brandAttrId?: string;
    modelAttrId?: string;
    typeAttrId?: string;
    statusAttrId?: string;
    internalIdAttrId?: string;
    assignedUserAttrId?: string;
    nameAttrId?: string; // ID de l'attribut "Name" ou "Label"
  } {
    const mapping: any = {};

    // 1. Priorité: Utiliser la map des définitions si disponible (plus fiable)
    if (attributesDefinitionMap) {
      for (const [id, name] of Object.entries(attributesDefinitionMap)) {
        const lowerName = name.toLowerCase();

        // Brand / Constructeur
        if (!mapping.brandAttrId && (lowerName.includes('constructeur') || lowerName.includes('brand') || lowerName.includes('manufacturer'))) {
          mapping.brandAttrId = id;
        }
        // Model
        if (!mapping.modelAttrId && (lowerName === 'model' || lowerName === 'modèle' || lowerName.includes('modele'))) {
          mapping.modelAttrId = id;
        }
        // Serial Number
        if (!mapping.serialNumberAttrId && (lowerName === 'serial number' || lowerName === 'serial' || lowerName === 'n/s' || lowerName === 'numéro de série')) {
          mapping.serialNumberAttrId = id;
        }
        // Status
        if (!mapping.statusAttrId && (lowerName === 'status' || lowerName === 'statut' || lowerName === 'état' || lowerName === 'etat')) {
          mapping.statusAttrId = id;
        }
        // Assigned User
        if (!mapping.assignedUserAttrId && (lowerName === 'user' || lowerName === 'users' || lowerName === 'utilisateur' || lowerName === 'utilisateurs' || lowerName === 'owner')) {
          mapping.assignedUserAttrId = id;
        }
        // Internal ID
        if (!mapping.internalIdAttrId && (lowerName === 'internal id' || lowerName === 'id interne' || lowerName === 'numéro d\'inventaire' || lowerName === 'inventaire' || lowerName === 'key')) {
          mapping.internalIdAttrId = id;
        }
        // Name / Label (souvent l'ID 1 ou nommé Name)
        if (!mapping.nameAttrId && (lowerName === 'name' || lowerName === 'label' || lowerName === 'nom' || id === '1')) {
          mapping.nameAttrId = id;
        }
      }
    }

    // 2. Fallback: Parcourir tous les attributs pour détecter les types par valeur
    for (const attr of jiraAsset.attributes || []) {
      const value = attr.objectAttributeValues?.[0] as any;
      if (!value) continue;

      // Détecter le numéro de série (généralement un code alphanumérique)
      if (!mapping.serialNumberAttrId && value.value && typeof value.value === 'string') {
        const serialPattern = /^[A-Z0-9]{4,20}$/i;
        if (serialPattern.test(value.value) && value.value.length >= 4) {
          mapping.serialNumberAttrId = attr.objectTypeAttributeId;
          continue;
        }
      }

      // Détecter la marque (référence à un objet "Constructeurs" ou valeur simple)
      if (!mapping.brandAttrId && value.referencedType && value.referencedObject) {
        const refType = value.referencedObject.objectType?.name?.toLowerCase();
        if (refType?.includes('constructeur') || refType?.includes('brand') || refType?.includes('manufacturer')) {
          mapping.brandAttrId = attr.objectTypeAttributeId;
          continue;
        }
      }

      // Détecter le modèle (généralement une chaîne de texte)
      if (!mapping.modelAttrId && value.value && typeof value.value === 'string' && value.value.length > 2) {
        const modelPattern = /^(Precision|Latitude|ThinkPad|MacBook|Surface|EliteBook|ProBook)/i;
        if (modelPattern.test(value.value)) {
          mapping.modelAttrId = attr.objectTypeAttributeId;
          continue;
        }
      }

      // Détecter le statut (objet avec status.category)
      if (!mapping.statusAttrId && value.status) {
        mapping.statusAttrId = attr.objectTypeAttributeId;
        continue;
      }

      // Détecter l'ID interne (format PI-XXXX)
      if (!mapping.internalIdAttrId && value.value && typeof value.value === 'string') {
        if (/^PI-\d+$/i.test(value.value)) {
          mapping.internalIdAttrId = attr.objectTypeAttributeId;
          continue;
        }
      }

      // Détecter l'utilisateur affecté (référence à un objet utilisateur)
      if (!mapping.assignedUserAttrId && value.referencedType && value.referencedObject) {
        const refType = value.referencedObject.objectType?.name?.toLowerCase();
        if (refType?.includes('user') || refType?.includes('utilisateur') || refType?.includes('employee')) {
          mapping.assignedUserAttrId = attr.objectTypeAttributeId;
          continue;
        }
      }
    }

    return mapping;
  }

  /**
   * Récupérer les définitions des attributs pour un type d'objet donné
   * Cela permet de mapper les IDs d'attributs vers leurs noms lisibles
   */
  async getObjectTypeAttributes(objectTypeName: string, schemaName: string = 'Parc Informatique'): Promise<Record<string, string>> {
    try {
      // 1. Trouver l'ID du schéma
      const schemaId = await this.getObjectSchemaId(schemaName);
      if (!schemaId) {
        throw new Error(`Schéma "${schemaName}" non trouvé`);
      }

      // 2. Trouver l'ID du type d'objet
      const objectTypes = await this.getAllObjectTypes(schemaId);
      const objectType = objectTypes.find(ot => ot.name === objectTypeName);

      if (!objectType) {
        throw new Error(`Type d'objet "${objectTypeName}" non trouvé dans le schéma "${schemaName}"`);
      }

      // 3. Récupérer les attributs du type d'objet
      // GET /jsm/assets/workspace/{workspaceId}/v1/objecttype/{id}/attributes
      const url = this.buildAssetsUrl(`objecttype/${objectType.id}/attributes`);

      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.getAuthHeaders() }).pipe(
          map((res: any) => res.data),
        ),
      );

      // Créer un mapping ID -> Nom
      const attributeMap: Record<string, string> = {};

      if (Array.isArray(response)) {
        response.forEach((attr: any) => {
          attributeMap[attr.id] = attr.name;
        });
      }

      return attributeMap;
    } catch (error: any) {
      this.logger.warn(`⚠️ Impossible de récupérer les définitions des attributs pour ${objectTypeName}: ${error.message}`);
      return {};
    }
  }

  /**
   * Récupérer les détails complets des attributs pour un type d'objet
   * Renvoie une liste structuree: { id, name, type, description }
   */
  async getObjectTypeAttributesDetails(objectTypeName: string, schemaName: string = 'Parc Informatique'): Promise<any[]> {
    try {
      // 1. Trouver l'ID du schéma
      const schemaId = await this.getObjectSchemaId(schemaName);
      if (!schemaId) {
        throw new Error(`Schéma "${schemaName}" non trouvé`);
      }

      // 2. Trouver l'ID du type d'objet
      const objectTypes = await this.getAllObjectTypes(schemaId);
      const objectType = objectTypes.find(ot => ot.name === objectTypeName);

      if (!objectType) {
        throw new Error(`Type d'objet "${objectTypeName}" non trouvé dans le schéma "${schemaName}"`);
      }

      // 3. Récupérer les attributs du type d'objet
      const url = this.buildAssetsUrl(`objecttype/${objectType.id}/attributes`);

      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.getAuthHeaders() }).pipe(
          map((res: any) => res.data),
        ),
      );

      if (Array.isArray(response)) {
        return response.map((attr: any) => ({
          id: attr.id,
          name: attr.name,
          type: attr.type, // 0=Default, 1=Object, 2=User, 7=Status, etc.
          description: attr.description,
          defaultType: attr.defaultType, // Text, Integer, Date, etc.
          editable: attr.editable,
          removable: attr.removable,
        }));
      }

      return [];
    } catch (error: any) {
      this.logger.warn(`⚠️ Erreur lors de la récupération des détails des attributs pour ${objectTypeName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Synchroniser automatiquement tous les Laptops depuis Jira vers MongoDB
   * Détecte automatiquement les attributs et synchronise efficacement
   */
  async syncLaptopsFromJira(
    schemaName: string = 'Parc Informatique',
    objectTypeName: string = 'Laptop',
    options: {
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
    } = {},
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    total: number;
    attributeMapping: any;
  }> {
    const { limit = 1000, autoDetectAttributes = true, attributeMapping: providedMapping } = options;
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      total: 0,
      attributeMapping: {} as any,
    };

    try {
      this.logger.log(`🔄 Début de la synchronisation des ${objectTypeName} depuis Jira...`);

      // Récupérer tous les Laptops depuis Jira
      const jiraAssets = await this.getAllAssetsByObjectType(schemaName, objectTypeName, limit);
      results.total = jiraAssets.length;

      this.logger.log(`📦 ${jiraAssets.length} ${objectTypeName} trouvés dans Jira`);

      if (jiraAssets.length === 0) {
        this.logger.warn(`⚠️ Aucun ${objectTypeName} trouvé dans Jira`);
        return results;
      }

      // Récupérer les définitions des attributs (ID -> Nom) pour ce type d'objet
      this.logger.log(`🔍 Récupération des définitions des attributs pour "${objectTypeName}"...`);
      const attributesDefinitionMap = await this.getObjectTypeAttributes(objectTypeName, schemaName);
      const attributesCount = Object.keys(attributesDefinitionMap).length;
      if (attributesCount > 0) {
        this.logger.log(`✅ ${attributesCount} attributs définis trouvés pour "${objectTypeName}"`);
      } else {
        this.logger.warn(`⚠️ Aucune définition d'attribut trouvée, les noms des champs seront absents`);
      }

      // Détecter automatiquement les attributs depuis le premier objet si nécessaire
      let attributeMapping = providedMapping;
      if (autoDetectAttributes && !providedMapping) {
        this.logger.log(`🔍 Détection automatique des attributs depuis le premier objet...`);
        attributeMapping = this.detectAttributeIds(jiraAssets[0], attributesDefinitionMap);
        results.attributeMapping = attributeMapping;
        this.logger.log(`✅ Attributs détectés: ${JSON.stringify(attributeMapping)}`);
      } else if (providedMapping) {
        attributeMapping = providedMapping;
        results.attributeMapping = providedMapping;
      }

      // Vérifier que le numéro de série est détecté (requis)
      if (!attributeMapping?.serialNumberAttrId) {
        this.logger.warn(`⚠️ Numéro de série non détecté. Tentative de synchronisation avec les attributs disponibles...`);
      }

      // ============================================================
      // PRÉCHARGER TOUS LES USERS JIRA EN MÉMOIRE avant la synchro
      // Garantit une comparaison JS insensible à la casse/espaces,
      // sans dépendre des requêtes AQL LIKE (case-sensitive dans Jira)
      // ============================================================
      await this.loadUserRegistry();

      // Synchroniser chaque équipement par lots réduits pour limiter les race conditions
      // sur la création des utilisateurs Asset (duplication). Le verrou en mémoire gère
      // les conflits au sein d'un même lot, mais réduire la taille réduit la charge totale.
      const batchSize = 10;
      for (let i = 0; i < jiraAssets.length; i += batchSize) {
        const batch = jiraAssets.slice(i, i + batchSize);
        for (const jiraAsset of batch) {
          try {
            // Extraire le numéro de série pour vérification
            const serialNumberAttr = jiraAsset.attributes.find(
              a => a.objectTypeAttributeId === attributeMapping?.serialNumberAttrId
            );
            const serialNumber = serialNumberAttr?.objectAttributeValues?.[0]?.value?.toString();

            if (!serialNumber || serialNumber?.trim() === '') {
              this.logger.debug(`⚠️ Asset ${jiraAsset.id} sans numéro de série: utilisation du fallback.`);
            }

            // Vérifier si l'équipement existe déjà
            const existingBefore = await this.equipmentModel.findOne({
              $or: [
                { jiraAssetId: jiraAsset.id },
                { serialNumber: serialNumber?.trim() },
              ],
            }).exec();

            // Synchroniser l'équipement
            // Déterminer le type d'équipement à forcer selon le mapping
            const forcedType = getEquipmentType(objectTypeName) || EquipmentType.PC_PORTABLE;

            await this.syncEquipmentFromJira(jiraAsset.id, jiraAsset.objectTypeId, {
              serialNumberAttrId: attributeMapping?.serialNumberAttrId,
              brandAttrId: attributeMapping?.brandAttrId,
              modelAttrId: attributeMapping?.modelAttrId,
              typeAttrId: attributeMapping?.typeAttrId,
              statusAttrId: attributeMapping?.statusAttrId,
              internalIdAttrId: attributeMapping?.internalIdAttrId,
              assignedUserAttrId: attributeMapping?.assignedUserAttrId,
              forcedType, // Utiliser le type depuis le mapping
            }, attributesDefinitionMap); // Passer la map des définitions

            if (existingBefore) {
              results.updated++;
            } else {
              results.created++;
            }
          } catch (error: any) {
            results.errors++;
            this.logger.error(`❌ Erreur lors de la synchronisation de l'asset ${jiraAsset.id}: ${error.message}`);
          }
        }


        this.logger.log(`📊 Progression: ${Math.min(i + batchSize, jiraAssets.length)}/${jiraAssets.length} traités`);
      }

      this.logger.log(`✅ Synchronisation terminée: ${results.created} créés, ${results.updated} mis à jour, ${results.skipped} ignorés, ${results.errors} erreurs`);
      return results;
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la synchronisation complète: ${error.message}`);
      throw error;
    }
  }

  /**
   * Synchroniser tous les types d'équipements depuis Jira vers MongoDB
   * Cette méthode récupère automatiquement tous les types d'équipements configurés
   * (Laptop, Ecrans, Mobiles, Tablettes, etc.) et exclut les types de référence
   * (Localisation, Constructeurs, Users, etc.)
   */
  async syncAllEquipmentTypes(
    schemaName: string = 'Parc Informatique',
    options: {
      limit?: number;
      autoDetectAttributes?: boolean;
    } = {},
  ): Promise<{
    totalEquipmentTypes: number;
    results: Array<{
      objectTypeName: string;
      equipmentType: EquipmentType;
      created: number;
      updated: number;
      skipped: number;
      errors: number;
      total: number;
    }>;
    summary: {
      totalCreated: number;
      totalUpdated: number;
      totalSkipped: number;
      totalErrors: number;
      totalProcessed: number;
    };
  }> {
    const { limit = 10000, autoDetectAttributes = true } = options;

    this.logger.log(`🚀 Début de la synchronisation de tous les types d'équipements depuis le schéma "${schemaName}"...`);

    const results: Array<{
      objectTypeName: string;
      equipmentType: EquipmentType;
      created: number;
      updated: number;
      skipped: number;
      errors: number;
      total: number;
    }> = [];

    const summary = {
      totalCreated: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      totalErrors: 0,
      totalProcessed: 0,
    };

    try {
      // Récupérer tous les noms d'objectTypes configurés comme équipements
      const equipmentTypeNames = getAllEquipmentTypeNames();

      this.logger.log(`📋 Types d'équipements à synchroniser: ${equipmentTypeNames.join(', ')}`);
      this.logger.log(`🚫 Types de référence exclus: ${REFERENCE_OBJECT_TYPES.join(', ')}`);

      // ============================================================
      // PRÉCHARGER LE REGISTRE DES USERS UNE SEULE FOIS pour tout le cycle
      // Garantit des lookups insensibles à la casse pour tous les types d'équipements
      // ============================================================
      await this.loadUserRegistry();

      // Synchroniser chaque type d'équipement
      for (const objectTypeName of equipmentTypeNames) {
        const equipmentType = getEquipmentType(objectTypeName);

        if (!equipmentType) {
          this.logger.warn(`⚠️ Type d'équipement non trouvé pour "${objectTypeName}", ignoré`);
          continue;
        }

        try {
          this.logger.log(`\n${'='.repeat(60)}`);
          this.logger.log(`🔄 Synchronisation de "${objectTypeName}" → ${equipmentType}`);
          this.logger.log(`${'='.repeat(60)}\n`);

          // Utiliser la méthode existante syncLaptopsFromJira qui est générique
          const syncResult = await this.syncLaptopsFromJira(
            schemaName,
            objectTypeName,
            {
              limit,
              autoDetectAttributes,
            },
          );

          // Ajouter les résultats
          results.push({
            objectTypeName,
            equipmentType,
            created: syncResult.created,
            updated: syncResult.updated,
            skipped: syncResult.skipped,
            errors: syncResult.errors,
            total: syncResult.total,
          });

          // Mettre à jour le résumé
          summary.totalCreated += syncResult.created;
          summary.totalUpdated += syncResult.updated;
          summary.totalSkipped += syncResult.skipped;
          summary.totalErrors += syncResult.errors;
          summary.totalProcessed += syncResult.total;

          this.logger.log(`✅ "${objectTypeName}": ${syncResult.created} créés, ${syncResult.updated} mis à jour, ${syncResult.skipped} ignorés, ${syncResult.errors} erreurs`);
        } catch (error: any) {
          this.logger.error(`❌ Erreur lors de la synchronisation de "${objectTypeName}": ${error.message}`);
          results.push({
            objectTypeName,
            equipmentType,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: 1,
            total: 0,
          });
          summary.totalErrors++;
        }
      }

      this.logger.log(`\n${'='.repeat(60)}`);
      this.logger.log(`✅ SYNCHRONISATION COMPLÈTE TERMINÉE`);
      this.logger.log(`${'='.repeat(60)}`);
      this.logger.log(`📊 Résumé global:`);
      this.logger.log(`   - Types d'équipements traités: ${results.length}`);
      this.logger.log(`   - Total d'objets traités: ${summary.totalProcessed}`);
      this.logger.log(`   - Créés: ${summary.totalCreated}`);
      this.logger.log(`   - Mis à jour: ${summary.totalUpdated}`);
      this.logger.log(`   - Ignorés: ${summary.totalSkipped}`);
      this.logger.log(`   - Erreurs: ${summary.totalErrors}`);
      this.logger.log(`${'='.repeat(60)}\n`);

      return {
        totalEquipmentTypes: results.length,
        results,
        summary,
      };
    } catch (error: any) {
      this.logger.error(`❌ Erreur fatale lors de la synchronisation de tous les équipements: ${error.message}`);
      throw error;
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

      // ============================================================
      // PRÉCHARGER LE REGISTRE UTILISATEURS
      // ============================================================
      await this.loadUserRegistry();

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
    try {
      // Modern Assets API (AQL)
      const searchUrl = this.buildAssetsUrl('object/aql');

      const response = await firstValueFrom(
        this.httpService.post<{ values: JiraAssetObjectResponse[] }>(
          searchUrl,
          { qlQuery: query || "" },
          {
            params: {
              maxResults: limit,
              includeAttributes: true,
            },
            headers: this.getAuthHeaders(),
          },
        ),
      );

      return response.data.values || [];
    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la recherche d'assets dans Jira (AQL): ${error.message}`);
      if (error.response) {
        this.logger.error(`Détails: ${JSON.stringify(error.response.data)}`);
      }
      // On propage l'erreur pour éviter de créer des doublons si l'API de recherche est HS
      throw error;
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
      forcedType?: EquipmentType; // Type forcé (pour les Laptops, etc.)
    },
    attributesDefinitionMap?: Record<string, string> // Map des définitions ID -> Nom
  ): Promise<EquipmentDocument> {
    const jiraAsset = await this.getAssetFromJira(jiraAssetId);

    // Extraire les attributs selon le mapping
    const getAttributeValue = (attributeId?: string): string | undefined => {
      if (!attributeId) return undefined;
      const attr = jiraAsset.attributes.find(a => a.objectTypeAttributeId === attributeId);
      if (!attr) return undefined;

      const val = attr.objectAttributeValues[0] as any;
      if (!val) return undefined;

      // Gérer le cas où la valeur est un objet Status (nom dans .status.name)
      if (val.status && val.status.name) {
        return val.status.name;
      }

      // Gérer le cas où la valeur est un objet référencé (comme un User Asset, ou Localisation)
      if (val.referencedObject) {
        return val.referencedObject.name || val.referencedObject.label || val.value?.toString();
      }

      return val.value?.toString();
    };

    // --- CONSTRUCTION DE LA MAP COMPLÈTE DES ATTRIBUTS JIRA ---
    const jiraAttributes: Record<string, any> = {};
    if (attributesDefinitionMap) {
      // Parcourir tous les attributs présents sur l'objet Jira
      jiraAsset.attributes.forEach(attr => {
        const attributeName = attributesDefinitionMap[attr.objectTypeAttributeId];

        if (attributeName) {
          const values = attr.objectAttributeValues.map((val: any) => {
            // Traiter les différents types de valeurs (texte, référence, statut...)
            if (val.referencedObject) {
              return val.referencedObject.name || val.referencedObject.label || 'Référence inconnue';
            }
            if (val.status) {
              return val.status.name;
            }
            return val.value; // Valeur brute
          });

          // Si une seule valeur, on la met directement. Sinon on met le tableau.
          // On convertit en chaîne si nécessaire, ou on garde le type primitif
          jiraAttributes[attributeName] = values.length === 1 ? values[0] : values;
        }
      });
    }

    let serialNumber = getAttributeValue(attributeMapping.serialNumberAttrId);
    let isMissingSerialNumber = false;
    if (!serialNumber || serialNumber.trim() === '') {
      serialNumber = `MANQUANT_${jiraAsset.objectKey}`;
      isMissingSerialNumber = true;
    }
    const brand = getAttributeValue(attributeMapping.brandAttrId);
    const model = getAttributeValue(attributeMapping.modelAttrId);
    const type = getAttributeValue(attributeMapping.typeAttrId);
    const status = getAttributeValue(attributeMapping.statusAttrId);
    const internalId = getAttributeValue(attributeMapping.internalIdAttrId);
    let assignedUserEmail = getAttributeValue(attributeMapping.assignedUserAttrId);
    
    // Fallback: si l'association a échoué (souvent parce que l'ID n'a pas pu être mappé), on lit directement par le nom
    if (!assignedUserEmail && jiraAttributes) {
      assignedUserEmail = jiraAttributes['user'] || jiraAttributes['User'] || jiraAttributes['Utilisateur'] || jiraAttributes['utilisateur'] || jiraAttributes['owner'];
      if (assignedUserEmail) {
        this.logger.debug(`💡 Utilisateur trouvé via fallback jiraAttributes: ${assignedUserEmail}`);
      }
    }

    

    // Chercher l'équipement existant par jiraAssetId ou serialNumber
    let equipment = await this.equipmentModel.findOne({
      $or: [
        { jiraAssetId },
        { serialNumber },
      ],
    }).exec();

    // Utiliser le type forcé si fourni, sinon celui détecté depuis Jira, sinon 'autre'
    const equipmentType = attributeMapping.forcedType || type || EquipmentType.AUTRE;

    const equipmentData: any = {
      serialNumber,
      brand: brand || 'Inconnu',
      model: model || 'Inconnu',
      type: equipmentType,
      objectTypeName: (jiraAsset as any).objectType?.name,
      isMissingSerialNumber,
      jiraAssetId,
      status: this.mapJiraStatusToEquipmentStatus(status) || EquipmentStatus.EN_STOCK,
      jiraAttributes, // Sauvegarder tous les attributs Jira
    };

    if (internalId) {
      equipmentData.internalId = internalId;
    }

    // Si un utilisateur est affecté dans Jira, essayer de le trouver dans MongoDB
    // Note: Cela nécessite que l'utilisateur existe déjà dans MongoDB (synchronisé depuis Office 365)
    if (assignedUserEmail) {
      this.logger.debug(`🔍 Recherche de l'utilisateur M365 pour la valeur Jira: "${assignedUserEmail}"`);
      
      // Recherche par email exact ou par displayName (insensible à la casse)
      const user = await this.userModel.findOne({
        $or: [
          { email: { $regex: new RegExp(`^${assignedUserEmail}$`, 'i') } },
          { displayName: { $regex: new RegExp(`^${assignedUserEmail}$`, 'i') } }
        ]
      }).exec();

      if (user) {
        this.logger.debug(`✅ Utilisateur trouvé dans MongoDB: ${user.email} (${user.displayName})`);
        equipmentData.currentUserId = user._id;
        
        // Si un utilisateur est affecté, le statut est "AFFECTE"
        if (!status || status.toLowerCase() === 'disponible' || status.toLowerCase() === 'available' || status.toLowerCase() === 'en stock') {
          equipmentData.status = EquipmentStatus.AFFECTE;
        }

        // Nous créerons l'allocation APRÈS la sauvegarde de l'équipement (plus bas)
        // pour avoir l'ID MongoDB de l'équipement
      } else {
        this.logger.warn(`⚠️ Utilisateur "${assignedUserEmail}" trouvé dans Jira mais non trouvé dans MongoDB. Vérifier la synchronisation O365.`);
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

    if (this.allocationsService) {
      // Gestion de la RESTITUTION automatique
      if (equipmentData.status === EquipmentStatus.EN_STOCK || equipmentData.status === 'disponible') {
        await this.allocationsService.closeActiveAllocationForEquipment(equipment._id.toString());
      }
      
      // Gestion de la DOTATION automatique
      if (equipment.currentUserId && equipment.status === EquipmentStatus.AFFECTE) {
        // Chercher une allocation active pour CET équipement
        const activeAlloc = await this.allocationsService.getActiveAllocationForEquipment(equipment._id.toString());

        if (activeAlloc && activeAlloc.userId.toString() === equipment.currentUserId.toString()) {
          this.logger.debug(`✅ Allocation déjà existante pour l'équipement ${equipment.serialNumber} et l'utilisateur ${equipment.currentUserId}`);
        } else {
          if (activeAlloc) {
            this.logger.warn(`⚠️ L'équipement ${equipment.serialNumber} était alloué à un autre utilisateur, clôture de l'ancienne allocation.`);
            await this.allocationsService.closeActiveAllocationForEquipment(equipment._id.toString());
          }

          this.logger.log(`📝 Création automatique de l'allocation (dotation) pour l'équipement ${equipment.serialNumber}`);
          try {
            const newAllocation = await this.allocationsService.create({
              userId: equipment.currentUserId.toString(),
              equipments: [{ equipmentId: equipment._id.toString() } as any],
              deliveryDate: new Date().toISOString(),
            }, 'Jira Sync');
            this.logger.log(`✅ Allocation créée avec succès (ID: ${newAllocation._id}).`);

            // Générer le PDF de dotation et mettre à jour les documents de l'utilisateur
            if (this.pdfGeneratorService && newAllocation._id) {
              try {
                await this.pdfGeneratorService.generateAllocationPDF(newAllocation._id.toString());
                this.logger.log(`✅ Allocation et document PDF créés avec succès.`);
              } catch (pdfErr: any) {
                this.logger.error(`❌ Erreur lors de la génération du PDF pour l'allocation ${newAllocation._id}: ${pdfErr.message}`);
              }
            } else {
              this.logger.warn(`⚠️ PdfGeneratorService non disponible, le PDF ne sera pas généré.`);
            }
          } catch (err: any) {
            this.logger.error(`❌ Erreur lors de la création automatique de l'allocation: ${err.message}`);
          }
        }
      }
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
        const accountId = await this.findJiraUserByEmail(user.email);
        if (accountId) {
          attributes.push({
            objectTypeAttributeId: attributeMapping.assignedUserAttrId,
            objectAttributeValues: [{ value: accountId }],
          });
        } else {
          // Fallback to email if account ID not found, though likely to fail if restricted
          attributes.push({
            objectTypeAttributeId: attributeMapping.assignedUserAttrId,
            objectAttributeValues: [{ value: user.email }],
          });
        }
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
      statusAttrId?: string;
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

    // Auto-détection des attributs si non fournis
    if (!attributeMapping.statusAttrId || !attributeMapping.assignedUserAttrId) {
      try {
        this.logger.debug(`🔍 Auto-détection des IDs d'attributs pour l'asset ${equipment.jiraAssetId}...`);

        // 1. Récupérer l'asset pour connaître son type et ses attributs actuels
        const asset = await this.getAssetFromJira(equipment.jiraAssetId);
        const objectTypeName = asset.objectType.name;

        // 2. Récupérer les définitions d'attributs COMPLÈTES pour ce type (pour la détection par type)
        const attributesDetails = await this.getObjectTypeAttributesDetails(objectTypeName);

        // Reconstruire la map simple (ID -> Nom) pour detectAttributeIds
        const attributesMap: Record<string, string> = {};
        attributesDetails.forEach((attr: any) => { attributesMap[attr.id] = attr.name; });

        // 3. Utiliser la méthode de détection existante
        const detected = this.detectAttributeIds(asset, attributesMap);

        if (!attributeMapping.statusAttrId && detected.statusAttrId) {
          attributeMapping.statusAttrId = detected.statusAttrId;
          this.logger.debug(`   ✅ Statut détecté: ID ${detected.statusAttrId}`);
        }

        // 3b. Détecter l'attribut Utilisateur (on cherche de préférence un lien vers un Objet Asset "User")
        // on cherche un champ qui s'appelle 'utilisateur', 'user', etc. BUT with Type=1 (Object) preference
        const userAttribute = attributesDetails.find((a: any) =>
          ['utilisateur', 'user', 'users', 'utilisateurs', 'collaborateur', 'employe'].includes(a.name.toLowerCase())
        );

        // Si on a plusieurs candidats, on privilégie "user" (Nom exact de l'Objet dans votre schéma)
        const specificUserAttr = attributesDetails.find((a: any) =>
          a.name.toLowerCase() === 'user' && a.type === 1
        );

        // Fallback sur "Utilisateur" s'il n'y a pas "user"
        const fallbackUserAttr = attributesDetails.find((a: any) =>
          a.name.toLowerCase() === 'utilisateur' && a.type === 1
        );

        // Si on trouve un attribut type Object, c'est celui-là qu'on veut !
        const selectedUserAttr = specificUserAttr || fallbackUserAttr || userAttribute;

        if (selectedUserAttr) {
          attributeMapping.assignedUserAttrId = selectedUserAttr.id;
          this.logger.debug(`   ✅ Utilisateur détecté: ID ${selectedUserAttr.id} (Type: ${selectedUserAttr.type}, Nom: ${selectedUserAttr.name})`);
        }

        if (!attributeMapping.assignedUserAttrId && detected.assignedUserAttrId) {
          attributeMapping.assignedUserAttrId = detected.assignedUserAttrId;
          this.logger.debug(`   ✅ Utilisateur détecté via fallback: ID ${detected.assignedUserAttrId}`);
        }

      } catch (error: any) {
        this.logger.error(`❌ Erreur lors de l'auto-détection des attributs: ${error.message}`);
      }
    }
    // Construire le payload de mise à jour (statut + utilisateur uniquement)
    const attributes = [
      {
        objectTypeAttributeId: attributeMapping.statusAttrId,
        objectAttributeValues: [{ value: this.mapEquipmentStatusToJira(equipment.status) }],
      },
    ];

    // Log du payload pour debug
    this.logger.debug(`📤 Payload mise à jour Jira (Status): ${JSON.stringify(attributes[0])}`);

    // Mettre à jour l'utilisateur affecté si l'attribut est configuré
    let jiraUserIdForLog: string | null = null;
    if (attributeMapping.assignedUserAttrId) {
      const user = equipment.currentUserId as any; // Cast car populate
      if (user && user.email) {
        // 1. Chercher si l'utilisateur existe dans les OBJETS Assets "Users"
        await this.loadUserRegistry();

        let assetUser = await this.findAssetUserByEmail(user.email, user.displayName);
        let userId = assetUser ? assetUser.id : null;

        // 2. Si non trouvé, le créer dans Assets
        if (!userId) {
          const newUserObj = await this.createAssetUser({
            email: user.email,
            firstName: user.firstName || user.displayName?.split(' ')[0] || '',
            lastName: user.lastName || user.displayName?.split(' ').slice(1).join(' ') || '',
            displayName: user.displayName || user.email
          });
          if (newUserObj) {
            userId = newUserObj.id;
          }
        }

        if (userId) {
          jiraUserIdForLog = userId;
          // L'attribut "Utilisateur" dans Laptop attend une référence à un objet Users
          attributes.push({
            objectTypeAttributeId: attributeMapping.assignedUserAttrId,
            objectAttributeValues: [{ value: userId }], // Utilisation de l'ID interne
          });
          this.logger.debug(`📤 Payload mise à jour Jira (User): Email=${user.email} -> AssetID=${userId} (AttrID=${attributeMapping.assignedUserAttrId})`);
        } else {
          this.logger.warn(`⚠️ Utilisateur ${user.email} introuvable et création échouée dans Assets. L'affectation sera ignorée.`);
        }
      } else {
        // Libérer l'utilisateur dans Jira
        attributes.push({
          objectTypeAttributeId: attributeMapping.assignedUserAttrId,
          objectAttributeValues: [],
        });
        this.logger.debug(`📤 Payload mise à jour Jira (User): Suppression (AttrID=${attributeMapping.assignedUserAttrId})`);
      }
    }

    try {
      // Filtrer les attributs dont l'ID est manquant
      const validAttributes = attributes.filter(a => a.objectTypeAttributeId);

      if (validAttributes.length === 0) {
        this.logger.warn(`⚠️ Aucun attribut valide à mettre à jour pour l'équipement ${equipment.serialNumber}. IDs détectés: Status=${attributeMapping.statusAttrId}, User=${attributeMapping.assignedUserAttrId}`);
        return;
      }

      await this.updateAssetInJira(equipment.jiraAssetId, validAttributes as any);
      // Mettre à jour lastSyncedAt SANS recharger les données depuis Jira
      // (le rechargement depuis Jira créerait une race condition car Jira n'a pas encore propagé le changement)
      await this.equipmentModel.findByIdAndUpdate(equipment._id, { lastSyncedAt: new Date() });
      this.logger.log(`✅ Statut Jira mis à jour pour l'équipement ${equipment.serialNumber}: Status="${this.mapEquipmentStatusToJira(equipment.status)}", UserID=${jiraUserIdForLog || 'Libéré'}`);
      this.logger.debug(`📊 Attributs utilisés: StatusID=${attributeMapping.statusAttrId}, UserID=${attributeMapping.assignedUserAttrId}`);

    } catch (error: any) {
      this.logger.error(`❌ Erreur lors de la mise à jour du statut Jira: ${error.message}`);
      if (error.response?.data) {
        this.logger.error(`Détails erreur Jira: ${JSON.stringify(error.response.data)}`);
      }
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
      // Statuts réels dans Jira (basé sur vos captures)
      'en stock': EquipmentStatus.EN_STOCK,
      'en_stock': EquipmentStatus.EN_STOCK,
      'affecte': EquipmentStatus.AFFECTE,
      'affecté': EquipmentStatus.AFFECTE,
      'available': EquipmentStatus.EN_STOCK,
      'assigned': EquipmentStatus.AFFECTE,
      'en intervention': EquipmentStatus.EN_REPARATION,
      'en_reparation': EquipmentStatus.EN_REPARATION,
      'en_maintenance': EquipmentStatus.EN_REPARATION,
      'maintenance': EquipmentStatus.EN_REPARATION,
      'repair': EquipmentStatus.EN_REPARATION,
      'restitue': EquipmentStatus.RESTITUE,
      'returned': EquipmentStatus.RESTITUE,
      'perdu': EquipmentStatus.PERDU,
      'lost': EquipmentStatus.PERDU,
      'rebut': EquipmentStatus.DETRUIT,
      'detruit': EquipmentStatus.DETRUIT,
      'destroyed': EquipmentStatus.DETRUIT,
    };

    return statusMap[jiraStatus.toLowerCase()] || EquipmentStatus.EN_STOCK;
  }

  /**
   * Mapper le statut Equipment vers le statut Jira
   */
  private mapEquipmentStatusToJira(status: EquipmentStatus): string {
    const statusMap: Record<EquipmentStatus, string> = {
      [EquipmentStatus.EN_STOCK]: 'EN STOCK', // Valeur exacte dans votre Jira
      [EquipmentStatus.AFFECTE]: 'AFFECTE',   // Valeur exacte dans votre Jira
      [EquipmentStatus.EN_REPARATION]: 'EN INTERVENTION',
      [EquipmentStatus.RESTITUE]: 'EN STOCK',
      [EquipmentStatus.PERDU]: 'REBUT',
      [EquipmentStatus.DETRUIT]: 'REBUT',
    };

    return statusMap[status] || 'EN STOCK';
  }
}
