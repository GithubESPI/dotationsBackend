
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AllocationsService } from '../src/allocations/allocations.service';
import { Allocation, AllocationSchema, AllocationStatus } from '../src/database/schemas/allocation.schema';
import { Equipment, EquipmentSchema, EquipmentStatus } from '../src/database/schemas/equipment.schema';
import { User, UserSchema } from '../src/database/schemas/user.schema';
import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { Types } from 'mongoose';

dotenv.config();

async function run() {
    const logger = new Logger('VerificationScript');
    logger.log('🚀 Starting verification of Allocation Auto-Close logic...');

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        logger.error('❌ MONGODB_URI not found in environment!');
        process.exit(1);
    }
    logger.log(`🔌 Connecting to MongoDB (URI length: ${uri.length})...`);

    // 1. Setup minimal ApplicationContext
    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({ isGlobal: true }),
            MongooseModule.forRoot(uri), // Use direct URI from process.env
            MongooseModule.forFeature([
                { name: Allocation.name, schema: AllocationSchema },
                { name: Equipment.name, schema: EquipmentSchema },
                { name: User.name, schema: UserSchema },
            ]),
        ],
        providers: [
            AllocationsService,
            // Mock 'JiraAssetService' token used in AllocationsService
            {
                provide: 'JiraAssetService',
                useValue: {},
            }
        ],
    }).compile();

    const allocationsService = moduleRef.get<AllocationsService>(AllocationsService);
    const equipmentModel = moduleRef.get(getModelToken(Equipment.name));
    const allocationModel = moduleRef.get(getModelToken(Allocation.name));
    const userModel = moduleRef.get(getModelToken(User.name));

    // 2. Prepare Test Data
    const timestamp = Date.now();
    const testSerial = `TEST-AUTO-CLOSE-${timestamp}`;
    const testUserEmail = `test-auto-close-${timestamp}@example.com`;

    try {
        // Create User
        const user = await userModel.create({
            email: testUserEmail,
            displayName: 'Test Auto Close User',
            firstName: 'Test',
            lastName: 'User',
            jobTitle: 'Tester',
            department: 'IT',
            companyName: 'Test Corp',
            officeLocation: 'Test Lab',
        });
        logger.log(`👤 Test User created: ${user._id}`);

        // Create Equipment (Affected)
        const equipment = await equipmentModel.create({
            serialNumber: testSerial,
            brand: 'TestBrand',
            model: 'TestModel',
            type: 'PC_portable',
            status: EquipmentStatus.AFFECTE,
            currentUserId: user._id,
        });
        logger.log(`💻 Test Equipment created: ${equipment._id} (Status: ${equipment.status})`);

        // Create Allocation (In Progress)
        const allocation = await allocationModel.create({
            userId: user._id,
            userName: user.displayName,
            userEmail: user.email,
            equipments: [{
                equipmentId: equipment._id,
                serialNumber: equipment.serialNumber,
                deliveredDate: new Date(),
            }],
            deliveryDate: new Date(),
            status: AllocationStatus.EN_COURS,
            createdBy: 'Verification Script',
        });
        logger.log(`Bx Test Allocation created: ${allocation._id} (Status: ${allocation.status})`);

        // 3. Execute Logic under test
        logger.log('🔄 Executing closeActiveAllocationForEquipment...');
        await allocationsService.closeActiveAllocationForEquipment(equipment._id.toString());

        // 4. Verify Result
        const updatedAllocation = await allocationModel.findById(allocation._id);
        logger.log(`🔍 Updated Allocation Status: ${updatedAllocation.status}`);

        if (updatedAllocation.status === AllocationStatus.TERMINEE) {
            logger.log('✅ SUCCESS: Allocation was automatically closed!');
            if (updatedAllocation.notes && updatedAllocation.notes.includes('[AUTO]')) {
                logger.log('   (Note was correctly added)');
            }
        } else {
            logger.error('❌ FAILURE: Allocation status is not TERMINEE');
        }

        // 5. Cleanup
        await allocationModel.deleteOne({ _id: allocation._id });
        await equipmentModel.deleteOne({ _id: equipment._id });
        await userModel.deleteOne({ _id: user._id });
        logger.log('🧹 Cleanup completed');

    } catch (error) {
        logger.error(`❌ Unexpected error: ${error.message}`);
        console.error(error);
    } finally {
        await moduleRef.close();
    }
}

run();
