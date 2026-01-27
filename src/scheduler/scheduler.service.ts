import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JiraAssetService } from '../jira-asset/jira-asset.service';
import { EmployeesService } from '../employees/employees.service';
import { GraphService } from '../auth/services/graph.service';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly jiraAssetService: JiraAssetService,
        private readonly employeesService: EmployeesService,
        private readonly graphService: GraphService,
    ) { }

    @Cron(CronExpression.EVERY_HOUR)
    async handleCron() {
        this.logger.log('Starting scheduled equipment sync...');
        try {
            const result = await this.jiraAssetService.syncAllEquipmentTypes();
            this.logger.log(`Scheduled equipment sync completed: Created ${result.summary.totalCreated}, Updated ${result.summary.totalUpdated}, Errors ${result.summary.totalErrors}`);
        } catch (error) {
            this.logger.error('Error during scheduled equipment sync', error);
        }
    }

    @Cron(CronExpression.EVERY_30_MINUTES)
    async handleEmployeeSync() {
        this.logger.log('Starting scheduled employee sync...');
        try {
            // Obtenir un token d'application (pas lié à un utilisateur)
            const accessToken = await this.graphService.getApplicationAccessToken();

            // Lancer la synchronisation
            const result = await this.employeesService.syncFromOffice365(accessToken);

            this.logger.log(`Scheduled employee sync completed: Synced ${result.synced}, Skipped ${result.skipped}, Errors ${result.errors}`);
        } catch (error) {
            this.logger.error('Error during scheduled employee sync', error);
        }
    }
}
