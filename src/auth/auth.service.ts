import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GraphService } from './services/graph.service';

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  sub: string;
  roles?: string[];
  graphData?: any; // Données supplémentaires de Microsoft Graph
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private graphService: GraphService,
  ) {}

  async validateAzureADUser(profile: any): Promise<UserPayload> {
    // Valider et transformer le profil Azure AD
    if (!profile || !profile.oid || !profile.upn) {
      throw new UnauthorizedException('Profil Azure AD invalide');
    }

    return {
      id: profile.oid,
      email: profile.upn || profile.email || profile.preferred_username,
      name: profile.displayName || profile.name || profile.given_name,
      sub: profile.oid,
      roles: profile.roles || [],
    };
  }

  async login(user: UserPayload & { profile?: any }, azureAccessToken?: string) {
    // Si on a un access token Azure AD, récupérer les données depuis Microsoft Graph
    let graphUserData: any = null;
    let userRoles = [...(user.roles || [])];
    
    // Récupérer les groupes inclus directement dans le profil Azure AD (si configuré)
    let allGroups: string[] = [
      ...userRoles,
      ...(user.profile?._json?.groups || []),
      ...(user.profile?.groups || [])
    ];

    if (azureAccessToken) {
      try {
        const graphProfile = await this.graphService.getUserProfile(azureAccessToken);
        // Récupérer aussi la photo et les groupes depuis Graph API
        const [photo, groups] = await Promise.all([
          this.graphService.getUserPhoto(azureAccessToken),
          this.graphService.getUserGroups(azureAccessToken),
        ]);
        
        graphUserData = {
          ...graphProfile,
          photo,
          groups,
        };

        if (groups && Array.isArray(groups)) {
          allGroups.push(...groups);
        }
      } catch (error) {
        console.warn('Impossible de récupérer completement les données Graph (permissions manquantes?)', error);
      }
    }

    // Afficher les groupes pour le debuggage serveur
    console.log(`[AUTH] Groupes identifiés pour ${user.email} :`, allGroups);

    // Si l'utilisateur appartient au groupe DSIT -2SRT (par nom ou ID), lui donner le rôle d'admin DSIT
    const dsitGroupId = 'c571c975-78ba-4dab-8dbe-161eb441366e';
    const dsitGroupName = 'DSIT -2SRT';
    
    if (allGroups.some(g => typeof g === 'string' && (g === dsitGroupId || g === dsitGroupName || g.includes('DSIT -2SRT')))) {
      if (!userRoles.includes('DSIT_ADMIN')) {
        console.log(`[AUTH] Rôle DSIT_ADMIN attribué à ${user.email}`);
        userRoles.push('DSIT_ADMIN');
      }
    }

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: userRoles,
    };

    return {
      access_token: this.jwtService.sign(payload),
      azure_access_token: azureAccessToken, // Pour utilisation avec Graph Explorer
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: userRoles,
        graphData: graphUserData,
      },
    };
  }

  async validateJwtPayload(payload: any): Promise<UserPayload> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token invalide');
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      sub: payload.sub,
      roles: payload.roles || [],
    };
  }
}

