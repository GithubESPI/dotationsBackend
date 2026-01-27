import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { EquipmentModule } from './equipment/equipment.module';
import { AllocationsModule } from './allocations/allocations.module';
import { ReturnsModule } from './returns/returns.module';
import { PdfGeneratorModule } from './pdf-generator/pdf-generator.module';
import { JiraAssetModule } from './jira-asset/jira-asset.module';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    EquipmentModule,
    AllocationsModule,
    ReturnsModule,
    PdfGeneratorModule,
    JiraAssetModule,
    ScheduleModule.forRoot(),
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
