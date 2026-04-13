import axios from 'axios';
import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  Query,
  Body,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiOAuth2,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GraphService } from './services/graph.service';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AzureADGuard } from './guards/azure-ad.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { UserPayload } from './auth.service';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly graphService: GraphService,
  ) { }

  @Get('azure-ad')
  @Public()
  // @UseGuards(AzureADGuard) - Désactivé pour rendre l'authentification complètement stateless
  @ApiOperation({
    summary: 'Initier la connexion Azure AD',
    description: '⚠️ Cet endpoint déclenche une redirection OAuth2 vers Azure AD et ne peut pas être testé directement dans Swagger. Utilisez plutôt /auth/test avec un token Azure AD, ou ouvrez cet endpoint dans votre navigateur.',
  })
  @ApiResponse({ status: 302, description: 'Redirection vers Azure AD' })
  async azureAdAuth(@Request() req, @Res() res) {
    // Logger pour déboguer
    console.log('📤 Requête reçue sur /auth/azure-ad');
    console.log('   Session:', req.session?.id ? 'présente' : 'absente');
    console.log('   User:', req.user ? 'présent' : 'absent');

    // Si l'utilisateur est déjà authentifié, rediriger vers le frontend
    if (req.user) {
      console.log('✅ Utilisateur déjà authentifié, redirection vers le frontend');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/`);
    }

    // Si on arrive ici sans utilisateur, Passport devrait avoir redirigé
    // Mais si ce n'est pas le cas, construire manuellement l'URL de redirection Azure AD
    console.log('🔄 Construction de l\'URL de redirection Azure AD...');

    const tenantIdRaw = process.env.AZURE_AD_TENANT_ID;
    const tenantId = tenantIdRaw ? tenantIdRaw.replace(/^["']|["']$/g, '').trim() : 'common';
    const clientIDRaw = process.env.AZURE_AD_CLIENT_ID;
    const clientID = clientIDRaw ? clientIDRaw.replace(/^["']|["']$/g, '').trim() : undefined;
    const envRedirect = process.env.AZURE_AD_REDIRECT_URI;
    const resolvedRedirectUri =
      envRedirect && envRedirect.includes(',')
        ? envRedirect.split(',')[0].replace(/^["']|["']$/g, '').trim()
        : envRedirect ? envRedirect.replace(/^["']|["']$/g, '').trim() : 'http://localhost:3000/auth/azure-ad/callback';
    const redirectUri = encodeURIComponent(resolvedRedirectUri);
    const scopes = encodeURIComponent('openid profile email User.Read offline_access User.Read.All');
    const state = Math.random().toString(36).substring(7); // Générer un state aléatoire

    console.log('🚀 [AUTH-DEBUG-STEP-1] Initialisation de l\'authentification Azure AD');
    console.log(`   - Version du code: 2026-04-13-STEP-LOGS`);
    console.log(`   - Client ID: ${clientID?.substring(0, 8)}...`);
    console.log(`   - Redirect URI (résolu): ${resolvedRedirectUri}`);
    console.log(`   - Tenant ID: ${tenantId}`);

    // Sauvegarder le state dans la session pour la validation par passport-azure-ad
    if (req.session) {
      req.session.oauthState = state;
      // passport-azure-ad s'attend à trouver le state généré dans sa propre clé de session
      // Puisqu'on fait une redirection manuelle et qu'on court-circuite son initiation,
      // on doit créer cette structure manuellement pour éviter l'erreur "State mismatch" au retour.
      req.session['azuread-openidconnect'] = { state: state };
      req.session['azure-ad'] = { state: state }; // Au cas où la clé serait renommée
      console.log('   - State sauvegardé en session');
    } else {
      console.warn('   - ⚠️ Session absente lors de l\'initialisation');
    }

    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientID}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=${scopes}&state=${state}`;

    console.log('   - Redirection vers MicrosoftAuthorize: Success');
    return res.redirect(authUrl);
  }

  @Post('test')
  @Public()
  @ApiOperation({
    summary: '🧪 TESTER: Authentification avec un token Azure AD (pour Swagger)',
    description: 'Utilisez cet endpoint pour tester l\'authentification avec un token Azure AD obtenu depuis Microsoft Graph Explorer. Entrez votre token dans le champ ci-dessous.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        azureToken: {
          type: 'string',
          description: 'Token Azure AD obtenu depuis Graph Explorer (https://developer.microsoft.com/en-us/graph/graph-explorer)',
          example: 'eyJ0eXAiOiJKV1QiLCJub...',
        },
      },
      required: ['azureToken'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Authentification réussie avec données Microsoft Graph',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string', description: 'Token JWT pour l\'API' },
        azure_access_token: { type: 'string', description: 'Token Azure AD pour Microsoft Graph Explorer' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            roles: { type: 'array', items: { type: 'string' } },
            graphData: { type: 'object', description: 'Données depuis Microsoft Graph API' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token invalide ou expiré' })
  async testAuth(@Body() body: { azureToken: string }) {
    try {
      // Récupérer le profil depuis Graph API avec le token fourni
      const graphProfile = await this.graphService.getUserProfile(body.azureToken);

      // Récupérer aussi la photo et les groupes
      const [photo, groups] = await Promise.all([
        this.graphService.getUserPhoto(body.azureToken).catch(() => null),
        this.graphService.getUserGroups(body.azureToken).catch(() => []),
      ]);

      // Créer un objet utilisateur similaire à celui de la stratégie Azure AD
      const user: UserPayload = {
        id: graphProfile.id,
        email: graphProfile.mail || graphProfile.userPrincipalName || '',
        name: graphProfile.displayName || '',
        sub: graphProfile.id,
        roles: groups,
        graphData: {
          ...graphProfile,
          photo,
          groups,
        },
      };

      // Générer le token JWT et retourner la réponse
      return this.authService.login(user, body.azureToken);
    } catch (error: any) {
      throw new Error(
        `Erreur lors de l'authentification: ${error.message || 'Token invalide ou expiré'}. ` +
        `Assurez-vous d'avoir un token Azure AD valide obtenu depuis Graph Explorer.`
      );
    }
  }

  @Get('azure-ad/callback')
  @Public()
  // @UseGuards(AzureADGuard) - Désactivé pour gérer l'échange de code manuellement et éviter les erreurs de session (stateless)
  @ApiOperation({ summary: 'Callback Azure AD après authentification avec Microsoft Graph' })
  @ApiResponse({
    status: 302,
    description: 'Redirection vers le frontend avec le token',
  })
  async azureAdCallback(@Request() req, @Res() res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    try {
      const code = req.query.code;
      const error = req.query.error;
      const errorDescription = req.query.error_description;

      if (error) {
        console.error(`❌ Erreur retournée par Azure AD: ${error} - ${errorDescription}`);
        const errorUrl = `${frontendUrl}/callback?error=${encodeURIComponent(errorDescription || error)}`;
        return res.redirect(errorUrl);
      }

      if (!code) {
        console.error('❌ Erreur: Aucun code d\'autorisation reçu dans le callback');
        const errorUrl = `${frontendUrl}/callback?error=${encodeURIComponent('Aucun code d\'autorisation reçu')}`;
        return res.redirect(errorUrl);
      }

      // Configuration Azure AD
      const tenantIdRaw = process.env.AZURE_AD_TENANT_ID;
      const tenantId = tenantIdRaw ? tenantIdRaw.replace(/^["']|["']$/g, '').trim() : 'common';
      const clientIDRaw = process.env.AZURE_AD_CLIENT_ID;
      const clientID = clientIDRaw ? clientIDRaw.replace(/^["']|["']$/g, '').trim() : undefined;
      const clientSecretRaw = process.env.AZURE_AD_CLIENT_SECRET;
      const clientSecret = clientSecretRaw ? clientSecretRaw.replace(/^["']|["']$/g, '').trim() : undefined;

      const envRedirect = process.env.AZURE_AD_REDIRECT_URI;
      const redirectUri = (
        envRedirect && envRedirect.includes(',')
          ? envRedirect.split(',')[0].replace(/^["']|["']$/g, '').trim()
          : envRedirect ? envRedirect.replace(/^["']|["']$/g, '').trim() : 'http://localhost:3000/auth/azure-ad/callback'
      ); // NOTE: Restoration du domaine brut sans .replace() pour correspondre à .env

      console.log('🚀 [AUTH-DEBUG-STEP-2] Callback reçu d\'Azure AD');
      console.log(`   - Code reçu: ${code ? 'OUI (masqué)' : 'NON'}`);
      console.log(`   - Redirect URI utilisé pour l'échange: ${redirectUri}`);
      console.log(`   - Client ID: ${clientID?.substring(0, 8)}...`);

      if (!clientID || !clientSecret) {
        console.error('❌ [AUTH-DEBUG] CLIENT_ID ou CLIENT_SECRET manquant');
        throw new Error('CLIENT_ID ou CLIENT_SECRET manquant dans la configuration');
      }

      console.log('🔄 [AUTH-DEBUG-STEP-3] Échange du code d\'autorisation contre un access token...');

      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const params = new URLSearchParams();
      params.append('client_id', clientID);
      params.append('client_secret', clientSecret);
      params.append('code', code as string);
      params.append('redirect_uri', redirectUri);
      params.append('grant_type', 'authorization_code');
      // Les scopes doivent correspondre exactement à ceux demandés
      params.append('scope', 'openid profile email User.Read offline_access');

      let tokenResponse;
      try {
        tokenResponse = await axios.post(tokenUrl, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (tokenError: any) {
        console.error('❌ Erreur lors de l\'échange du code:', tokenError.response?.data || tokenError.message);

        const azureErrorData = tokenError.response?.data;
        const errorDetails = azureErrorData?.error_description || azureErrorData?.error || tokenError.message;

        const errorMessage = encodeURIComponent(`Erreur Azure AD lors de l'échange: ${errorDetails}`);
        return res.redirect(`${frontendUrl}/callback?error=${errorMessage}`);
      }

      const azureAccessToken = tokenResponse.data.access_token;

      if (!azureAccessToken) {
        throw new Error('Aucun access token reçu d\'Azure AD');
      }

      console.log('✅ Access token Azure AD reçu avec succès');

      // Récupérer le profil utilisateur depuis Microsoft Graph API
      const graphProfile = await this.graphService.getUserProfile(azureAccessToken);

      // Construire un objet utilisateur pour le service auth
      const userToLogin = {
        id: graphProfile.id,
        email: graphProfile.userPrincipalName || graphProfile.mail || '',
        name: graphProfile.displayName || graphProfile.givenName || 'Utilisateur Azure',
        sub: graphProfile.id,
        roles: [], // Sera enrichi par le authService
        profile: {
          _json: graphProfile
        }
      };

      console.log(`✅ Profil récupéré pour: ${userToLogin.email}`);

      // Connexion via le auth service (récupération des groupes, attribution du rôle, génération JWT)
      const result = await this.authService.login(userToLogin, azureAccessToken);

      // Rediriger vers le frontend via le fragment URL (#token=)
      const redirectUrl = `${frontendUrl}/callback#token=${encodeURIComponent(result.access_token)}`;

      console.log(`🔄 Redirection vers: ${frontendUrl}/callback`);
      return res.redirect(redirectUrl);
    } catch (error: any) {
      console.error('❌ Erreur dans le callback Azure AD:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const errorUrl = `${frontendUrl}/callback?error=${encodeURIComponent(error.message || 'Erreur lors de l\'authentification')}`;
      return res.redirect(errorUrl);
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtenir le profil de l\'utilisateur connecté' })
  @ApiResponse({
    status: 200,
    description: 'Profil utilisateur',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
        roles: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  getProfile(@CurrentUser() user: UserPayload) {
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Déconnexion (invalide le token côté client)' })
  @ApiResponse({ status: 200, description: 'Déconnexion réussie' })
  logout() {
    // Note: Pour une vraie déconnexion, vous devriez implémenter une blacklist de tokens
    // Pour l'instant, on retourne juste un succès
    return { message: 'Déconnexion réussie' };
  }

  @Get('graph/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Récupérer le profil utilisateur depuis Microsoft Graph API' })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Token Azure AD (optionnel, utilise le token de la session si non fourni)',
  })
  @ApiResponse({
    status: 200,
    description: 'Profil utilisateur depuis Microsoft Graph',
  })
  @ApiResponse({ status: 401, description: 'Non autorisé' })
  async getGraphProfile(@Query('token') token?: string, @CurrentUser() user?: UserPayload) {
    // Si un token est fourni en query, l'utiliser, sinon essayer de le récupérer depuis la session
    if (!token && user && (user as any).azureAccessToken) {
      token = (user as any).azureAccessToken;
    }

    if (!token) {
      throw new Error('Token Azure AD requis. Utilisez le paramètre ?token=VOTRE_TOKEN ou connectez-vous via /auth/azure-ad');
    }

    return this.graphService.getUserProfile(token);
  }

  @Get('graph/photo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Récupérer la photo de profil depuis Microsoft Graph API' })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Token Azure AD',
  })
  @ApiResponse({
    status: 200,
    description: 'Photo de profil en base64',
  })
  async getGraphPhoto(@Query('token') token?: string, @CurrentUser() user?: UserPayload) {
    if (!token && user && (user as any).azureAccessToken) {
      token = (user as any).azureAccessToken;
    }

    if (!token) {
      throw new Error('Token Azure AD requis');
    }

    const photo = await this.graphService.getUserPhoto(token);
    return { photo };
  }

  @Get('graph/groups')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Récupérer les groupes de l\'utilisateur depuis Microsoft Graph API' })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Token Azure AD',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des groupes',
  })
  async getGraphGroups(
    @Query('token') token?: string,
    @CurrentUser() user?: UserPayload,
    @Request() req?: any,
  ) {
    // 1. Essayer depuis le paramètre query
    if (!token) {
      // 2. Essayer depuis la session (si disponible)
      if (req?.session?.azureAccessToken && req.session.userId === user?.id) {
        token = req.session.azureAccessToken;
      }
      // 3. Essayer depuis le user (si stocké dans le JWT - non implémenté actuellement)
      else if (user && (user as any).azureAccessToken) {
        token = (user as any).azureAccessToken;
      }
    }

    if (!token) {
      throw new BadRequestException(
        'Token Azure AD requis. ' +
        'Fournissez-le via le paramètre query "token" ou ' +
        'assurez-vous que le token Azure AD est stocké dans localStorage (clé "azure_access_token") après la connexion.'
      );
    }

    const groups = await this.graphService.getUserGroups(token);
    return { groups };
  }

  @Post('graph/explorer')
  @Public()
  @ApiOperation({
    summary: '🧪 TESTER: Appeler n\'importe quel endpoint Microsoft Graph API',
    description: 'Testez n\'importe quel endpoint Microsoft Graph API avec un token Azure AD. Entrez votre token et l\'endpoint Graph à appeler (ex: /me, /me/memberOf, /users, etc.)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Token Azure AD obtenu depuis Graph Explorer (https://developer.microsoft.com/en-us/graph/graph-explorer)',
          example: 'eyJ0eXAiOiJKV1QiLCJub...',
        },
        endpoint: {
          type: 'string',
          default: '/me',
          description: 'Endpoint Graph API à appeler (ex: /me, /me/memberOf, /users, /me/messages, etc.)',
          example: '/me',
        },
      },
      required: ['token'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Résultat de l\'appel Graph API',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        endpoint: { type: 'string' },
        data: { type: 'object', description: 'Données retournées par Graph API' },
        error: { type: 'object', description: 'Erreur si success = false' },
      },
    },
  })
  async testGraphExplorer(@Body() body: { token: string; endpoint?: string }) {
    const endpoint = body.endpoint || '/me';
    const graphApiUrl = `https://graph.microsoft.com/v1.0${endpoint}`;

    try {
      const axios = require('axios');
      const response = await axios.get(graphApiUrl, {
        headers: {
          Authorization: `Bearer ${body.token}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        success: true,
        endpoint: graphApiUrl,
        data: response.data,
      };
    } catch (error: any) {
      return {
        success: false,
        endpoint: graphApiUrl,
        error: error.response?.data || error.message,
      };
    }
  }
}

