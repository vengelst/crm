import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  PlanningController,
  PlanningPhase6Controller,
  PlanningPhase7Controller,
  PlanningPhase8Controller,
  PlanningPhase9Controller,
  PlanningPhase10Controller,
} from './planning.controller';
import { PlanningService } from './planning.service';
import { CsvActualsProvider } from './import/csv-actuals-provider';
import { PlanningImportService } from './import/planning-import.service';
import { PlanningKpiService } from './kpi/planning-kpi.service';
import { PlanningAlertsService } from './alerts/planning-alerts.service';
import { PlanningAlertEngineService } from './alerts/planning-alert-engine.service';
import { PlanningWorkflowService } from './workflow/planning-workflow.service';
import { PlanningOrgService } from './workflow/planning-org.service';
import { PlanningBaselineService } from './workflow/planning-baseline.service';
import { PlanningBudgetService } from './finance/planning-budget.service';
import { PlanningCashflowService } from './finance/planning-cashflow.service';
import { PlanningCapacityService } from './capacity/planning-capacity.service';
import { PlanningPipelineService } from './pipeline/planning-pipeline.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [
    PlanningController,
    PlanningPhase6Controller,
    PlanningPhase7Controller,
    PlanningPhase8Controller,
    PlanningPhase9Controller,
    PlanningPhase10Controller,
  ],
  providers: [
    PlanningService,
    CsvActualsProvider,
    PlanningImportService,
    PlanningKpiService,
    PlanningAlertsService,
    PlanningAlertEngineService,
    PlanningWorkflowService,
    PlanningOrgService,
    PlanningBaselineService,
    PlanningBudgetService,
    PlanningCashflowService,
    PlanningCapacityService,
    PlanningPipelineService,
  ],
})
export class PlanningModule {}
