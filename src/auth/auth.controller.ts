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
  ) {}

  @Get('azure-ad')
  @Public()
  @UseGuards(AzureADGuard)
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
    const scopes = encodeURIComponent('openid profile email User.Read offline_access');
    const state = Math.random().toString(36).substring(7); // Générer un state aléatoire
    
    // Sauvegarder le state dans la session pour la validation
    if (req.session) {
      req.session.oauthState = state;
    }
    
    const azureAuthUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${clientID}&` +
      `response_type=code&` +
      `redirect_uri=${redirectUri}&` +
      `response_mode=query&` +
      `scope=${scopes}&` +
      `state=${state}`;
    
    console.log(`🔄 Redirection vers Azure AD: ${azureAuthUrl.substring(0, 100)}...`);
    return res.redirect(azureAuthUrl);
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
  @UseGuards(AzureADGuard)
  @ApiOperation({ summary: 'Callback Azure AD après authentification avec Microsoft Graph' })
  @ApiResponse({
    status: 302,
    description: 'Redirection vers le frontend avec le token',
  })
  async azureAdCallback(@Request() req, @Res() res) {
    try {
      // Logger les détails de la requête pour le débogage
      console.log('📥 Callback Azure AD reçu:', {
        url: req.url,
        query: req.query,
        hasUser: !!req.user,
        sessionId: req.session?.id,
        cookies: Object.keys(req.cookies || {}),
      });

      // Vérifier que l'utilisateur est bien authentifié
      if (!req.user) {
        console.error('❌ Erreur: req.user est undefined dans le callback');
        console.error('   Détails de la requête:', {
          query: req.query,
          params: req.params,
          session: req.session,
        });
        
        // Vérifier la configuration
        const envRedirect2 = process.env.AZURE_AD_REDIRECT_URI;
        const redirectUri =
          envRedirect2 && envRedirect2.includes(',')
            ? envRedirect2.split(',')[0].replace(/^["']|["']$/g, '').trim()
            : envRedirect2 ? envRedirect2.replace(/^["']|["']$/g, '').trim() : 'http://localhost:3000/auth/azure-ad/callback';
        const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
        console.error('   Configuration vérifiée:');
        console.error(`   - Redirect URI: ${redirectUri}`);
        console.error(`   - Client Secret: ${clientSecret ? 'défini (' + clientSecret.substring(0, 8) + '...)' : 'MANQUANT'}`);
        console.error(`   - URL de callback reçue: ${req.protocol}://${req.get('host')}${req.path}`);
        
        // Vérifier si l'URL de redirection correspond
        const expectedUrl = redirectUri.toLowerCase();
        const actualUrl = `${req.protocol}://${req.get('host')}${req.path}`.toLowerCase();
        if (expectedUrl !== actualUrl) {
          console.error(`   ⚠️  URL MISMATCH: L'URL de redirection ne correspond pas!`);
          console.error(`      Attendu: ${expectedUrl}`);
          console.error(`      Reçu: ${actualUrl}`);
        }
        
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        const errorMessage = encodeURIComponent(
          'Échec de l\'authentification. Vérifiez que le CLIENT_SECRET est correct et que l\'URL de redirection correspond exactement à celle configurée dans Azure Portal.'
        );
        const errorUrl = `${frontendUrl}/callback?error=${errorMessage}`;
        return res.redirect(errorUrl);
      }

      console.log('✅ Callback reçu, utilisateur authentifié:', req.user.email || req.user.id);

      // Passer l'access token Azure AD pour récupérer les données depuis Graph
      const azureAccessToken = req.user?.accessToken || req.user?.azureAccessToken;
      
      if (!azureAccessToken) {
        console.warn('⚠️  Aucun access token Azure AD trouvé dans req.user');
      }

      const result = await this.authService.login(req.user, azureAccessToken);
      
      // Stocker le token Azure AD dans la session pour utilisation ultérieure
      if (azureAccessToken && req.session) {
        req.session.azureAccessToken = azureAccessToken;
        req.session.userId = req.user.id;
      }
      
      // Rediriger vers le frontend via le fragment URL (#token=)
      // Le fragment n'est JAMAIS envoyé au serveur → évite le 431 sur Azure App Service
      // Le callback frontend lit déjà le token depuis window.location.hash (lignes 38-49)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/callback#token=${encodeURIComponent(result.access_token)}`;
      
      console.log(`🔄 Redirection vers: ${frontendUrl}/callback`);
      return res.redirect(redirectUrl);
    } catch (error: any) {
      console.error('❌ Erreur dans le callback Azure AD:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        query: req.query,
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

