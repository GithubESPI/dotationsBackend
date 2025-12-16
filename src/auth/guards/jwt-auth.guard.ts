import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Vérifier si la route est marquée comme publique
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const hasAuthHeader = !!authHeader;
    const tokenPreview = authHeader 
      ? authHeader.substring(0, 20) + '...' 
      : 'aucun header';
    
    // Gérer les erreurs explicites
    if (err) {
      this.logger.error('❌ Erreur dans JwtAuthGuard:', {
        error: err.message || err,
        errorName: err.name,
        url: request.url,
        method: request.method,
        hasAuthHeader,
        tokenPreview,
      });
      throw err;
    }

    // Gérer le cas où l'utilisateur n'est pas trouvé (token invalide, expiré, etc.)
    if (!user) {
      // Analyser le type d'erreur depuis info
      let errorMessage = 'Token JWT invalide ou manquant. Veuillez vous reconnecter.';
      let errorDetails = '';

      if (info) {
        // Gérer différents types d'erreurs JWT
        if (info.name === 'TokenExpiredError') {
          errorMessage = 'Token JWT expiré. Veuillez vous reconnecter.';
          errorDetails = `Expiré le: ${info.expiredAt}`;
        } else if (info.name === 'JsonWebTokenError') {
          errorMessage = 'Token JWT invalide. Veuillez vous reconnecter.';
          errorDetails = info.message || 'Format de token invalide';
        } else if (info.name === 'NotBeforeError') {
          errorMessage = 'Token JWT pas encore valide.';
          errorDetails = `Valide à partir de: ${info.date}`;
        } else if (typeof info === 'string') {
          errorDetails = info;
        } else if (info.message) {
          errorDetails = info.message;
        }
      }

      this.logger.warn('⚠️ Token JWT invalide ou manquant:', {
        url: request.url,
        method: request.method,
        hasAuthHeader,
        tokenPreview,
        errorType: info?.name || 'unknown',
        errorDetails,
      });

      throw new UnauthorizedException(errorMessage);
    }

    // Log de succès pour le debugging (optionnel, peut être désactivé en production)
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('✅ Authentification JWT réussie:', {
        url: request.url,
        method: request.method,
        userId: user.id || user.sub || 'unknown',
      });
    }

    return user;
  }
}

