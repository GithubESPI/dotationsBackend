import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JiraAssetModule } from '../jira-asset/jira-asset.module';
import { EmployeesModule } from '../employees/employees.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        JiraAssetModule,
        EmployeesModule,
        AuthModule,
    ],
    providers: [SchedulerService],
})
export class SchedulerModule { }
