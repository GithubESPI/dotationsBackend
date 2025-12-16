import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { UserPayload } from '../auth/auth.service';
import { SearchEmployeeDto } from './dto/search-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@ApiTags('Employees')
@Controller('employees')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Rechercher des employés avec filtres et pagination' })
  @ApiResponse({
    status: 200,
    description: 'Liste des employés avec pagination',
  })
  async search(@Query() searchDto: SearchEmployeeDto) {
    return this.employeesService.search(searchDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtenir tous les employés actifs' })
  @ApiResponse({
    status: 200,
    description: 'Liste de tous les employés actifs',
  })
  async findAll() {
    return this.employeesService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtenir les statistiques des employés' })
  @ApiResponse({
    status: 200,
    description: 'Statistiques des employés',
  })
  async getStats() {
    return this.employeesService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un employé par son ID' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de l\'employé' })
  @ApiResponse({
    status: 200,
    description: 'Employé trouvé',
  })
  @ApiResponse({ status: 404, description: 'Employé non trouvé' })
  async findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Synchroniser les employés depuis Office 365',
    description: 'Récupère tous les utilisateurs depuis Microsoft Graph API et les synchronise dans MongoDB. Nécessite un token Azure AD valide.',
  })
  @ApiResponse({
    status: 200,
    description: 'Synchronisation réussie',
    schema: {
      type: 'object',
      properties: {
        synced: { type: 'number', description: 'Nombre d\'utilisateurs synchronisés' },
        errors: { type: 'number', description: 'Nombre d\'erreurs' },
        skipped: { type: 'number', description: 'Nombre d\'utilisateurs ignorés (invités/système)' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token Azure AD invalide ou manquant' })
  async syncFromOffice365(
    @CurrentUser() user: UserPayload,
    @Body() body?: { token?: string },
    @Request() req?: any,
  ) {
    // 1. Récupérer le token Azure AD depuis le body
    let azureToken = body?.token;
    
    // 2. Si pas dans le body, essayer de récupérer depuis la session (si disponible)
    if (!azureToken && req?.session?.azureAccessToken && req.session.userId === user.id) {
      azureToken = req.session.azureAccessToken;
    }
    
    // 3. Si pas dans la session, essayer de récupérer depuis le user (si stocké dans le JWT - non implémenté actuellement)
    if (!azureToken && (user as any).azureAccessToken) {
      azureToken = (user as any).azureAccessToken;
    }
    
    if (!azureToken) {
      throw new BadRequestException(
        'Token Azure AD requis pour la synchronisation. ' +
        'Fournissez-le dans le body: { "token": "votre_token_azure_ad" } ou ' +
        'assurez-vous que le token Azure AD est stocké dans localStorage (clé "azure_access_token") après la connexion.'
      );
    }

    return this.employeesService.syncFromOffice365(azureToken);
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Mettre à jour un employé',
    description: '⚠️ Les employés sont synchronisés depuis Office 365. Les mises à jour manuelles sont limitées. Pour une synchronisation complète, utilisez POST /employees/sync',
  })
  @ApiParam({ name: 'id', description: 'ID MongoDB de l\'employé' })
  @ApiResponse({
    status: 200,
    description: 'Employé mis à jour',
  })
  @ApiResponse({ status: 404, description: 'Employé non trouvé' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateEmployeeDto) {
    return this.employeesService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un employé (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID MongoDB de l\'employé' })
  @ApiResponse({
    status: 204,
    description: 'Employé désactivé',
  })
  @ApiResponse({ status: 404, description: 'Employé non trouvé' })
  async deactivate(@Param('id') id: string) {
    await this.employeesService.deactivate(id);
  }
}

