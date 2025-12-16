import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
  givenName?: string;
  surname?: string;
}

@Injectable()
export class GraphService {
  private readonly graphApiBaseUrl = 'https://graph.microsoft.com/v1.0';

  constructor(private configService: ConfigService) {}

  /**
   * Récupère les informations de l'utilisateur depuis Microsoft Graph API
   * @param accessToken Token d'accès Azure AD
   * @returns Informations de l'utilisateur depuis Graph API
   */
  async getUserProfile(accessToken: string): Promise<GraphUser> {
    try {
      const response = await axios.get(`${this.graphApiBaseUrl}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      if (error.response) {
        console.error('Erreur Graph API:', error.response.status, error.response.data);
        throw new UnauthorizedException(
          `Erreur lors de la récupération du profil depuis Microsoft Graph: ${error.response.data?.error?.message || 'Erreur inconnue'}`,
        );
      }
      throw new UnauthorizedException('Erreur lors de la connexion à Microsoft Graph API');
    }
  }

  /**
   * Récupère la photo de profil de l'utilisateur depuis Microsoft Graph API
   * @param accessToken Token d'accès Azure AD
   * @param userId ID de l'utilisateur (optionnel, par défaut /me)
   * @returns Photo de profil en base64
   */
  async getUserPhoto(accessToken: string, userId?: string): Promise<string | null> {
    try {
      const endpoint = userId 
        ? `${this.graphApiBaseUrl}/users/${userId}/photo/$value`
        : `${this.graphApiBaseUrl}/me/photo/$value`;
      
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      // Convertir l'image en base64
      const base64Image = Buffer.from(response.data, 'binary').toString('base64');
      const contentType = response.headers['content-type'] || 'image/jpeg';
      return `data:${contentType};base64,${base64Image}`;
    } catch (error: any) {
      // La photo peut ne pas exister, ce n'est pas une erreur critique
      if (error.response?.status === 404) {
        return null;
      }
      console.warn('Impossible de récupérer la photo de profil:', error.message);
      return null;
    }
  }

  /**
   * Récupère toutes les informations d'un utilisateur depuis Microsoft Graph API
   * @param accessToken Token d'accès Azure AD
   * @param userId ID de l'utilisateur (optionnel, par défaut /me)
   * @returns Informations complètes de l'utilisateur
   */
  async getAllUserDetails(accessToken: string, userId?: string): Promise<any> {
    try {
      const endpoint = userId 
        ? `${this.graphApiBaseUrl}/users/${userId}`
        : `${this.graphApiBaseUrl}/me`;
      
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          $select: [
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
            'manager',
          ].join(','),
          $expand: 'manager($select=id,displayName,userPrincipalName)',
        },
      });

      return response.data;
    } catch (error: any) {
      if (error.response) {
        console.error('Erreur Graph API:', error.response.status, error.response.data);
        throw new UnauthorizedException(
          `Erreur lors de la récupération des détails utilisateur depuis Microsoft Graph: ${error.response.data?.error?.message || 'Erreur inconnue'}`,
        );
      }
      throw new UnauthorizedException('Erreur lors de la connexion à Microsoft Graph API');
    }
  }

  /**
   * Récupère les groupes/roles de l'utilisateur depuis Microsoft Graph API
   * @param accessToken Token d'accès Azure AD
   * @returns Liste des groupes de l'utilisateur
   */
  async getUserGroups(accessToken: string): Promise<string[]> {
    try {
      const response = await axios.get(`${this.graphApiBaseUrl}/me/memberOf`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      // Extraire les noms des groupes
      return response.data.value?.map((group: any) => group.displayName || group.id) || [];
    } catch (error: any) {
      console.warn('Impossible de récupérer les groupes:', error.message);
      return [];
    }
  }

  /**
   * Vérifie si l'utilisateur appartient à un groupe spécifique
   * @param accessToken Token d'accès Azure AD
   * @param groupId ID du groupe à vérifier
   * @returns true si l'utilisateur appartient au groupe
   */
  async checkUserInGroup(accessToken: string, groupId: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.graphApiBaseUrl}/me/memberOf/${groupId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return !!response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      console.warn('Erreur lors de la vérification du groupe:', error.message);
      return false;
    }
  }
}

