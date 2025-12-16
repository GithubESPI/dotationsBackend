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

  async login(user: UserPayload, azureAccessToken?: string) {
    // Si on a un access token Azure AD, récupérer les données depuis Microsoft Graph
    let graphUserData: any = null;
    if (azureAccessToken) {
      try {
        const graphProfile = await this.graphService.getUserProfile(azureAccessToken);
        // Récupérer aussi la photo et les groupes
        const [photo, groups] = await Promise.all([
          this.graphService.getUserPhoto(azureAccessToken),
          this.graphService.getUserGroups(azureAccessToken),
        ]);
        
        graphUserData = {
          ...graphProfile,
          photo,
          groups,
        };
      } catch (error) {
        console.warn('Impossible de récupérer les données Graph:', error);
        // On continue même si Graph API échoue
      }
    }

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
    };

    return {
      access_token: this.jwtService.sign(payload),
      azure_access_token: azureAccessToken, // Pour utilisation avec Graph Explorer
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
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

