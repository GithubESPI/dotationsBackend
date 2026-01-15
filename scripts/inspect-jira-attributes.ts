
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { JiraAssetService } from '../src/jira-asset/jira-asset.service';
import { Equipment, EquipmentSchema } from '../src/database/schemas/equipment.schema';
import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { AllocationsModule } from '../src/allocations/allocations.module';
import { AllocationsService } from '../src/allocations/allocations.service';

dotenv.config();

async function run() {
    const logger = new Logger('InspectAttributes');

    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({ isGlobal: true }),
            HttpModule,
            MongooseModule.forRoot(process.env.MONGODB_URI!),
            MongooseModule.forFeature([{ name: Equipment.name, schema: EquipmentSchema }]),
        ],
        providers: [
            JiraAssetService,
            { provide: AllocationsService, useValue: {} } // Mock
        ],
    }).compile();

    const jiraAssetService = moduleRef.get<JiraAssetService>(JiraAssetService);
    const objectTypeName = 'Users'; // Inspecting Users object type

    try {
        logger.log(`🔍 Fetching attribute definitions for ${objectTypeName}...`);
        const attributes = await jiraAssetService.getObjectTypeAttributesDetails(objectTypeName);

        logger.log('📋 Attributes Found:');
        attributes.forEach(attr => {
            logger.log(`   - [${attr.id}] ${attr.name} (Type: ${attr.type})`);
        });

        // Check specific fields
        const statusAttr = attributes.find(a => a.name.toLowerCase() === 'status');
        const userAttr = attributes.find(a => ['user', 'utilisateur', 'users'].includes(a.name.toLowerCase()));

        if (statusAttr) logger.log(`✅ Status Attribute found: ${statusAttr.id}`);
        else logger.error('❌ Status Attribute NOT found');

        if (userAttr) logger.log(`✅ User Attribute found: ${userAttr.id}`);
        else logger.error('❌ User Attribute NOT found');

    } catch (error) {
        logger.error(`❌ Error: ${error.message}`);
    } finally {
        await moduleRef.close();
    }
}

run();
