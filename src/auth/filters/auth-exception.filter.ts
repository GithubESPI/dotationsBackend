import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';

@Catch(UnauthorizedException)
export class AuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AuthExceptionFilter.name);

  catch(exception: UnauthorizedException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Vérifier si c'est une requête de callback Azure AD
    if (request.url.includes('/auth/azure-ad/callback')) {
      this.logger.error('❌ Erreur d\'authentification dans le callback Azure AD:', {
        message: exception.message,
        url: request.url,
        query: request.query,
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const errorMessage = encodeURIComponent(
        exception.message || 'Erreur lors de l\'authentification'
      );
      const errorUrl = `${frontendUrl}/callback?error=${errorMessage}`;
      
      return response.redirect(errorUrl);
    }

    // Pour les autres routes, retourner une réponse JSON standard
    const status = exception.getStatus() || HttpStatus.UNAUTHORIZED;
    response.status(status).json({
      statusCode: status,
      message: exception.message || 'Non autorisé',
      error: 'Unauthorized',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

