import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('Application')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Point de terminaison de santé de l\'API' })
  @ApiResponse({
    status: 200,
    description: 'API fonctionnelle',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  })
  getHello() {
    return {
      message: this.appService.getHello(),
      timestamp: new Date().toISOString(),
    };
  }
}
