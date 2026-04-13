import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AzureADGuard extends AuthGuard('azure-ad') {
  private readonly logger = new Logger(AzureADGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Logger la tentative d'accès
    this.logger.log(`🔐 Tentative d'authentification Azure AD pour: ${request.url}`);
    
    // Toujours permettre à Passport de gérer l'authentification
    // Passport va automatiquement rediriger vers Azure AD si nécessaire
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Logger les détails pour le débogage
    if (err) {
      this.logger.error('❌ Erreur dans AzureADGuard:', {
        error: err.message || err,
        stack: err.stack,
        url: request.url,
        query: request.query,
      });
      throw err;
    }

    // Pour la route /auth/azure-ad, si pas d'utilisateur, Passport devrait avoir redirigé
    // Si on arrive ici sans utilisateur, c'est qu'il y a un problème
    if (!user && request.url === '/auth/azure-ad') {
      this.logger.warn('⚠️  Aucune redirection effectuée par Passport pour /auth/azure-ad');
      this.logger.warn('   Info:', info);
      // Ne pas bloquer, laisser Passport gérer
      return undefined;
    }

    if (!user) {
      // Logger l'erreur complète pour le débogage
      const errorDetails: any = {
        url: request.url,
        query: request.query,
        session: request.session ? 'présente' : 'absente',
      };
      
      // Si info contient des détails sur l'erreur, les logger
      if (info) {
        if (typeof info === 'string') {
          errorDetails.infoMessage = info;
        } else if (info.message) {
          errorDetails.infoMessage = info.message;
        } else {
          errorDetails.info = JSON.stringify(info, null, 2);
        }
        
        // Si c'est une erreur d'échange de code, logger les détails
        if (info.message && info.message.includes('failed to redeem authorization code')) {
          this.logger.error('❌ ERREUR CRITIQUE: Échec de l\'échange du code d\'autorisation');
          this.logger.error('   Cela peut être dû à:');
          this.logger.error('   1. AZURE_AD_CLIENT_SECRET incorrect ou expiré');
          this.logger.error('   2. URL de redirection ne correspond pas exactement à celle dans Azure Portal');
          this.logger.error('   3. Le code d\'autorisation a expiré (les codes expirent rapidement)');
          const _envR = process.env.AZURE_AD_REDIRECT_URI;
          const _resolvedUri = _envR && _envR.includes(',') ? _envR.split(',')[0].replace(/^["']|["']$/g, '').trim() : _envR ? _envR.replace(/^["']|["']$/g, '').trim() : 'http://localhost:3000/auth/azure-ad/callback';
          this.logger.error(`   Redirect URI configuré: ${_resolvedUri}`);
          this.logger.error(`   Code reçu: ${request.query?.code ? request.query.code.substring(0, 50) + '...' : 'aucun'}`);
        }
      }
      
      this.logger.warn('⚠️  Aucun utilisateur trouvé dans AzureADGuard:', errorDetails);
    } else {
      this.logger.log('✅ Utilisateur authentifié dans AzureADGuard:', {
        userId: user.id,
        email: user.email,
      });
    }

    return user;
  }
}

