import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { OIDCStrategy } from 'passport-azure-ad';
import type { IProfile, VerifyCallback } from 'passport-azure-ad';

@Injectable()
export class AzureADStrategy extends PassportStrategy(OIDCStrategy as any, 'azure-ad') {
  constructor(private configService: ConfigService) {
    // IMPORTANT: Utiliser le Tenant ID spécifique (pas 'common') pour limiter l'accès aux utilisateurs du tenant
    const tenantId = configService.get<string>('AZURE_AD_TENANT_ID');
    
    if (!tenantId || tenantId === 'common') {
      console.warn('⚠️  ATTENTION: AZURE_AD_TENANT_ID n\'est pas configuré ou est défini sur "common".');
      console.warn('   Pour limiter l\'accès aux utilisateurs du tenant, configurez un Tenant ID spécifique.');
    }

    const clientID = configService.get<string>('AZURE_AD_CLIENT_ID');
    const clientSecret = configService.get<string>('AZURE_AD_CLIENT_SECRET');
    const redirectUri = configService.get<string>('AZURE_AD_REDIRECT_URI') || 'http://localhost:3000/auth/azure-ad/callback';

    // Validation des paramètres requis
    if (!clientID || clientID.trim() === '') {
      throw new Error(
        'AZURE_AD_CLIENT_ID est manquant ou vide. ' +
        'Veuillez configurer AZURE_AD_CLIENT_ID dans votre fichier .env. ' +
        'Voir env.example pour un exemple de configuration.'
      );
    }

    if (!clientSecret || clientSecret.trim() === '') {
      throw new Error(
        'AZURE_AD_CLIENT_SECRET est manquant ou vide. ' +
        'Veuillez configurer AZURE_AD_CLIENT_SECRET dans votre fichier .env.'
      );
    }

    console.log('✅ Configuration Azure AD chargée:');
    console.log(`   Client ID: ${clientID.substring(0, 8)}...`);
    console.log(`   Tenant ID: ${tenantId || 'common'}`);
    console.log(`   Redirect URI: ${redirectUri}`);

    const strategyOptions = {
      identityMetadata: `https://login.microsoftonline.com/${tenantId || 'common'}/v2.0/.well-known/openid-configuration`,
      clientID: clientID.trim(),
      clientSecret: clientSecret.trim(),
      // Utiliser 'code' au lieu de 'code id_token' pour éviter l'erreur AADSTS700054
      // Si vous voulez utiliser 'code id_token', activez "ID tokens" dans Azure Portal
      responseType: 'code' as const,
      responseMode: 'query' as const, // 'query' fonctionne mieux avec 'code'
      redirectUrl: redirectUri,
      allowHttpForRedirectUrl: configService.get<string>('NODE_ENV') !== 'production',
      validateIssuer: true, // Valide que le token provient du bon tenant
      passReqToCallback: false,
      // Scopes pour Microsoft Graph API
      scope: ['openid', 'profile', 'email', 'User.Read', 'offline_access'],
    };

    const verify = (
      iss: string,
      sub: string,
      profile: IProfile,
      accessToken: string,
      refreshToken: string,
      done: VerifyCallback,
    ) => {
      console.log('🔍 Verify callback appelé avec:', {
        iss,
        sub,
        profileOid: profile?.oid,
        profileDisplayName: profile?.displayName,
        profileUpn: profile?.upn,
        profileEmails: profile?.emails,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenLength: accessToken?.length || 0,
      });

      if (!profile || !profile.oid) {
        console.error('❌ Profil Azure AD invalide:', profile);
        return done(new UnauthorizedException('Profil Azure AD invalide'), null);
      }

      // Vérifier que l'utilisateur appartient au tenant configuré
      // Le tenant ID est dans l'issuer (iss) : https://login.microsoftonline.com/{tenant-id}/v2.0
      const expectedTenantId = tenantId || 'common';
      if (expectedTenantId !== 'common' && iss) {
        const issuerTenantId = iss.split('/')[3]; // Extrait le tenant ID de l'issuer
        if (issuerTenantId !== expectedTenantId) {
          return done(
            new UnauthorizedException(
              `L'utilisateur n'appartient pas au tenant autorisé. Tenant attendu: ${expectedTenantId}, Tenant de l'utilisateur: ${issuerTenantId}`,
            ),
            null,
          );
        }
      }

      // Extraire l'email du profil
      const email = profile.upn || (profile.emails && Array.isArray(profile.emails) && profile.emails[0]) || '';
      
      // Vérifier que l'email appartient au domaine autorisé (optionnel)
      const allowedDomain = configService.get<string>('AZURE_AD_ALLOWED_DOMAIN');
      if (allowedDomain && email && !email.endsWith(`@${allowedDomain}`)) {
        return done(
          new UnauthorizedException(
            `L'email ${email} n'appartient pas au domaine autorisé: @${allowedDomain}`,
          ),
          null,
        );
      }

      const user = {
        id: profile.oid,
        email: email,
        name: profile.displayName || (profile.name && typeof profile.name === 'string' ? profile.name : '') || '',
        sub: profile.oid,
        roles: (profile as any).roles || [],
        accessToken, // Token Azure AD pour Microsoft Graph API
        refreshToken,
        azureAccessToken: accessToken, // Alias pour faciliter l'accès
        profile: profile,
      };

      console.log(`✅ Utilisateur authentifié: ${user.email} (${user.name})`);
      console.log(`📊 Token Azure AD disponible pour Microsoft Graph API`);
      return done(null, user);
    };

    super(strategyOptions as any, verify as any);
  }
}
