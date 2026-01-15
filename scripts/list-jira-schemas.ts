
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { JiraAssetService } from '../src/jira-asset/jira-asset.service';
import { Equipment, EquipmentSchema } from '../src/database/schemas/equipment.schema';
import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { AllocationsService } from '../src/allocations/allocations.service';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

dotenv.config();

async function run() {
    const logger = new Logger('InspectSchemas');

    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({ isGlobal: true }),
            HttpModule,
            MongooseModule.forRoot(process.env.MONGODB_URI!),
            MongooseModule.forFeature([{ name: Equipment.name, schema: EquipmentSchema }]),
        ],
        providers: [
            JiraAssetService,
            { provide: AllocationsService, useValue: {} }
        ],
    }).compile();

    const jiraAssetService = moduleRef.get<JiraAssetService>(JiraAssetService);

    try {
        logger.log(`🔍 Listing Object Schemas...`);

        // Using internal method logic from getObjectSchemaId manually to debug
        const service: any = jiraAssetService;
        const url = service.buildAssetsUrl('objectschema/list');
        const response = await firstValueFrom(
            service.httpService.get(url, { headers: service.getAuthHeaders() }).pipe(
                map((res: any) => res.data),
            ),
        );

        logger.log('📋 Schemas Found:');
        const data: any = response;
        if (data && data.values) {
            data.values.forEach((s: any) => {
                logger.log(`   - [ID: ${s.id}] Name: "${s.name}" (Key: ${s.objectSchemaKey})`);
            });
        } else {
            logger.warn('⚠️ No "values" property in response');
            console.log(JSON.stringify(response, null, 2));
        }

    } catch (error) {
        logger.error(`❌ Error: ${error.message}`);
        if (error.response) {
            console.log('Response data:', error.response.data);
        }
    } finally {
        await moduleRef.close();
    }
}

run();
