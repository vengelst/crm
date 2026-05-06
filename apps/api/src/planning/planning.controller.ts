import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PlanningService } from './planning.service';
import {
  PatchPlanningScenarioDto,
  UpsertPlanningScenarioDto,
} from './dto/planning-scenario.dto';
import { UpdatePlanningTargetsDto } from './dto/planning-targets.dto';
import {
  PatchPlanningActualDto,
  RestorePlanningVersionDto,
  UpsertPlanningActualDto,
} from './dto/planning-actual.dto';
import {
  DUPLICATE_STRATEGIES,
  DuplicateStrategy,
} from './dto/planning-import.dto';
import { PlanningImportService } from './import/planning-import.service';
import {
  AlertStatus,
  CreatePlanningAlertRuleDto,
  PatchPlanningAlertRuleDto,
} from './dto/planning-alert.dto';
import { PlanningKpiService } from './kpi/planning-kpi.service';
import { PlanningAlertsService } from './alerts/planning-alerts.service';
import { PlanningAlertEngineService } from './alerts/planning-alert-engine.service';
import {
  CreateOrgRefDto,
  PatchOrgRefDto,
  ScenarioOrgPatchDto,
  SetBaselineDto,
  WorkflowCommentDto,
  WorkflowRejectDto,
} from './workflow/dto';
import { PlanningWorkflowService } from './workflow/planning-workflow.service';
import { PlanningOrgService } from './workflow/planning-org.service';
import { PlanningBaselineService } from './workflow/planning-baseline.service';
import {
  CreateBudgetItemDto,
  PatchBudgetItemDto,
  PatchCashflowConfigDto,
} from './finance/dto';
import { PlanningBudgetService } from './finance/planning-budget.service';
import { PlanningCashflowService } from './finance/planning-cashflow.service';
import { PatchCapacityProfileDto } from './capacity/dto';
import { PlanningCapacityService } from './capacity/planning-capacity.service';
import {
  CreatePipelineItemDto,
  PIPELINE_RANGES,
  PIPELINE_SCENARIOS,
  PIPELINE_STAGES,
  PatchPipelineItemDto,
  PipelineRange,
  PipelineScenario,
  PipelineStage,
} from './pipeline/dto';
import { PlanningPipelineService } from './pipeline/planning-pipeline.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker' | 'kiosk-user' | 'emergency-admin';
  };
};

/**
 * REST-Endpunkte fuer Planungsszenarien (Ertragsplanung).
 *
 * Doppelte Absicherung: `@Roles` schliesst Worker/Kiosk aus, `@Permissions`
 * verlangt zusaetzlich die feingranularen Codes:
 *   - `planning.view`    Lesen
 *   - `planning.edit`    Schreiben/Loeschen
 *   - `planning.targets` Zielwerte pflegen
 *   - `planning.export`  CSV/PDF-Download
 */
@Controller('planning')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class PlanningController {
  constructor(
    private readonly planningService: PlanningService,
    private readonly importService: PlanningImportService,
  ) {}

  @Get('scenarios')
  @Permissions('planning.view')
  list(
    @Query('locationId') locationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('status') status?: string,
  ) {
    return this.planningService.list({
      locationId: locationId === 'null' ? null : locationId,
      businessUnitId: businessUnitId === 'null' ? null : businessUnitId,
      status,
    });
  }

  @Get('scenarios/:id')
  @Permissions('planning.view')
  getOne(@Param('id') id: string) {
    return this.planningService.getById(id);
  }

  @Post('scenarios')
  @Permissions('planning.edit')
  create(
    @Body() dto: UpsertPlanningScenarioDto,
    @Req() request: RequestWithUser,
  ) {
    return this.planningService.create(dto, request.user!.sub);
  }

  @Patch('scenarios/:id')
  @Permissions('planning.edit')
  update(
    @Param('id') id: string,
    @Body() dto: PatchPlanningScenarioDto,
    @Req() request: RequestWithUser,
  ) {
    return this.planningService.update(id, dto, request.user!.sub);
  }

  @Delete('scenarios/:id')
  @Permissions('planning.edit')
  remove(@Param('id') id: string) {
    return this.planningService.remove(id);
  }

  @Post('scenarios/:id/duplicate')
  @Permissions('planning.edit')
  duplicate(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.planningService.duplicate(id, request.user!.sub);
  }

  @Patch('scenarios/:id/targets')
  @Permissions('planning.targets')
  updateTargets(
    @Param('id') id: string,
    @Body() dto: UpdatePlanningTargetsDto,
    @Req() request: RequestWithUser,
  ) {
    // Body roh auslesen, damit wir zwischen "nicht gesendet" und "null" sauber
    // unterscheiden koennen — class-transformer macht das im DTO sonst zunichte.
    const raw = (request.body ?? {}) as Record<string, unknown>;
    const knownKeys: ReadonlyArray<keyof UpdatePlanningTargetsDto> = [
      'targetMonthlyRevenue',
      'targetMonthlyMargin',
      'targetMarginPercent',
    ];
    const rawKeys = knownKeys.filter((k) =>
      Object.prototype.hasOwnProperty.call(raw, k),
    );
    return this.planningService.updateTargets(
      id,
      dto,
      rawKeys,
      request.user?.sub,
    );
  }

  // ── Export: einzelnes Szenario ────────────────────────────────

  @Post('scenarios/:id/export/csv')
  @Permissions('planning.export')
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const file = await this.planningService.buildCsvSingle(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.content);
  }

  @Post('scenarios/:id/export/pdf')
  @Permissions('planning.export')
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
    const file = await this.planningService.buildPdfSingle(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.content);
  }

  // ── Export: Vergleich (mehrere Szenarien) ─────────────────────
  // Eigener Pfad ohne `scenarios/`-Praefix, sonst wuerde Express die Route
  // gegen `scenarios/:id/...` matchen und nach einem Szenario mit id
  // "compare" suchen (404).

  @Post('compare/export/csv')
  @Permissions('planning.export')
  async exportCompareCsv(
    @Body() body: { ids?: string[] },
    @Res() res: Response,
  ) {
    const file = await this.planningService.buildCsvCompare(body.ids ?? []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.content);
  }

  @Post('compare/export/pdf')
  @Permissions('planning.export')
  async exportComparePdf(
    @Body() body: { ids?: string[] },
    @Res() res: Response,
  ) {
    const file = await this.planningService.buildPdfCompare(body.ids ?? []);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.content);
  }

  // ── Phase 4: Versionierung ────────────────────────────────────

  @Get('scenarios/:id/versions')
  @Permissions('planning.versioning.manage')
  listVersions(@Param('id') id: string) {
    return this.planningService.listVersions(id);
  }

  @Get('scenarios/:id/versions/:versionId')
  @Permissions('planning.versioning.manage')
  getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.planningService.getVersion(id, versionId);
  }

  @Post('scenarios/:id/versions/:versionId/restore')
  @Permissions('planning.versioning.manage')
  restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: RestorePlanningVersionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.planningService.restoreVersion(
      id,
      versionId,
      dto,
      request.user!.sub,
    );
  }

  // ── Phase 4: Ist-Werte (Actuals) ──────────────────────────────

  @Get('actuals')
  @Permissions('planning.forecast.view')
  listActuals(@Query('from') from?: string, @Query('to') to?: string) {
    return this.planningService.listActuals({ from, to });
  }

  @Post('actuals')
  @Permissions('planning.actuals.edit')
  createActual(
    @Body() dto: UpsertPlanningActualDto,
    @Req() request: RequestWithUser,
  ) {
    return this.planningService.createActual(dto, request.user!.sub);
  }

  @Patch('actuals/:id')
  @Permissions('planning.actuals.edit')
  updateActual(@Param('id') id: string, @Body() dto: PatchPlanningActualDto) {
    return this.planningService.updateActual(id, dto);
  }

  @Delete('actuals/:id')
  @Permissions('planning.actuals.edit')
  removeActual(@Param('id') id: string) {
    return this.planningService.removeActual(id);
  }

  // ── Phase 4: Plan-vs-Ist + Forecast ───────────────────────────

  @Get('scenarios/:id/plan-vs-actual')
  @Permissions('planning.forecast.view')
  planVsActual(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.planningService.getPlanVsActual(id, from, to);
  }

  @Get('scenarios/:id/forecast')
  @Permissions('planning.forecast.view')
  forecast(
    @Param('id') id: string,
    @Query('months') months?: string,
    @Query('mode') mode?: string,
  ) {
    const m = mode === 'trend' ? 'trend' : 'plan';
    const n = months ? Number.parseInt(months, 10) : 6;
    return this.planningService.getForecast(id, n, m);
  }

  // ── Phase 5: Import (CSV) ─────────────────────────────────────

  @Post('actuals/import/dry-run')
  @Permissions('planning.import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importDryRun(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('duplicateStrategy') duplicateStrategy: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const strategy = normalizeStrategy(duplicateStrategy);
    return this.importService.dryRun(file, strategy, request.user?.sub);
  }

  @Post('actuals/import/commit')
  @Permissions('planning.import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importCommit(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('duplicateStrategy') duplicateStrategy: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const strategy = normalizeStrategy(duplicateStrategy);
    return this.importService.commit(file, strategy, request.user?.sub);
  }

  @Get('import-jobs')
  @Permissions('planning.import.logs.view')
  listImportJobs() {
    return this.importService.listJobs();
  }

  @Get('import-jobs/:id')
  @Permissions('planning.import.logs.view')
  getImportJob(@Param('id') id: string) {
    return this.importService.getJob(id);
  }

  @Get('import-jobs/:id/errors.csv')
  @Permissions('planning.import.logs.view')
  async exportImportJobErrors(@Param('id') id: string, @Res() res: Response) {
    const file = await this.importService.getJobErrorsCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.content);
  }
}

function normalizeStrategy(value: string | undefined): DuplicateStrategy {
  if (value && (DUPLICATE_STRATEGIES as readonly string[]).includes(value)) {
    return value as DuplicateStrategy;
  }
  return 'skip';
}

// ── Phase 6: KPIs + Alerts ──────────────────────────────────────────

@Controller('planning')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class PlanningPhase6Controller {
  constructor(
    private readonly kpiService: PlanningKpiService,
    private readonly alertsService: PlanningAlertsService,
    private readonly alertEngine: PlanningAlertEngineService,
  ) {}

  // ── KPI-Dashboard ────────────────────────────────────────────

  @Get('kpis')
  @Permissions('planning.kpi.view')
  getKpis(
    @Query('range') range?: string,
    @Query('scenarioId') scenarioId?: string,
  ) {
    const months = range === '12m' ? 12 : 6;
    return this.kpiService.getDashboard(months, scenarioId);
  }

  // ── Alert-Regeln (CRUD) ──────────────────────────────────────

  @Get('alerts/rules')
  @Permissions('planning.alerts.manage')
  listRules() {
    return this.alertsService.listRules();
  }

  @Post('alerts/rules')
  @Permissions('planning.alerts.manage')
  createRule(
    @Body() dto: CreatePlanningAlertRuleDto,
    @Req() request: RequestWithUser,
  ) {
    return this.alertsService.createRule(dto, request.user?.sub);
  }

  @Patch('alerts/rules/:id')
  @Permissions('planning.alerts.manage')
  updateRule(@Param('id') id: string, @Body() dto: PatchPlanningAlertRuleDto) {
    return this.alertsService.updateRule(id, dto);
  }

  @Delete('alerts/rules/:id')
  @Permissions('planning.alerts.manage')
  removeRule(@Param('id') id: string) {
    return this.alertsService.removeRule(id);
  }

  // ── Alerts (Lifecycle) ───────────────────────────────────────

  @Get('alerts')
  @Permissions('planning.alerts.manage')
  listAlerts(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.alertsService.listAlerts({
      status: (status as AlertStatus) ?? undefined,
      severity,
      from,
      to,
    });
  }

  @Post('alerts/:id/ack')
  @Permissions('planning.alerts.manage')
  ackAlert(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.alertsService.acknowledge(id, request.user?.sub);
  }

  @Post('alerts/:id/resolve')
  @Permissions('planning.alerts.manage')
  resolveAlert(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.alertsService.resolve(id, request.user?.sub);
  }

  @Post('alerts/evaluate')
  @Permissions('planning.alerts.manage')
  evaluateAlerts() {
    return this.alertEngine.evaluate();
  }
}

// ── Phase 7: Workflow + Multi-Standort + Baselines ──────────────────

@Controller('planning')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class PlanningPhase7Controller {
  constructor(
    private readonly workflowService: PlanningWorkflowService,
    private readonly orgService: PlanningOrgService,
    private readonly baselineService: PlanningBaselineService,
  ) {}

  // ── Workflow-Aktionen am Szenario ────────────────────────────

  @Post('scenarios/:id/submit')
  @Permissions('planning.review.submit')
  submit(
    @Param('id') id: string,
    @Body() dto: WorkflowCommentDto,
    @Req() request: RequestWithUser,
  ) {
    return this.workflowService.submit(id, dto, request.user?.sub);
  }

  @Post('scenarios/:id/approve')
  @Permissions('planning.review.approve')
  approve(
    @Param('id') id: string,
    @Body() dto: WorkflowCommentDto,
    @Req() request: RequestWithUser,
  ) {
    return this.workflowService.approve(id, dto, request.user?.sub);
  }

  @Post('scenarios/:id/reject')
  @Permissions('planning.review.reject')
  reject(
    @Param('id') id: string,
    @Body() dto: WorkflowRejectDto,
    @Req() request: RequestWithUser,
  ) {
    return this.workflowService.reject(id, dto, request.user?.sub);
  }

  @Post('scenarios/:id/archive')
  @Permissions('planning.edit')
  archive(
    @Param('id') id: string,
    @Body() dto: WorkflowCommentDto,
    @Req() request: RequestWithUser,
  ) {
    return this.workflowService.archive(id, dto, request.user?.sub);
  }

  @Post('scenarios/:id/unarchive')
  @Permissions('planning.edit')
  unarchive(
    @Param('id') id: string,
    @Body() dto: WorkflowCommentDto,
    @Req() request: RequestWithUser,
  ) {
    return this.workflowService.unarchive(id, dto, request.user?.sub);
  }

  @Get('scenarios/:id/decision-log')
  @Permissions('planning.view')
  decisionLog(@Param('id') id: string) {
    return this.workflowService.getDecisionLog(id);
  }

  @Patch('scenarios/:id/org')
  @Permissions('planning.edit')
  setOrg(@Param('id') id: string, @Body() dto: ScenarioOrgPatchDto) {
    return this.workflowService.setOrgTags(id, dto);
  }

  // ── Baselines ────────────────────────────────────────────────

  @Get('baselines')
  @Permissions('planning.view')
  listBaselines(
    @Query('locationId') locationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.baselineService.list({
      locationId: locationId === 'null' ? null : locationId,
      businessUnitId: businessUnitId === 'null' ? null : businessUnitId,
      activeOnly: activeOnly === 'true',
    });
  }

  @Post('scenarios/:id/set-baseline')
  @Permissions('planning.baseline.manage')
  setBaseline(
    @Param('id') id: string,
    @Body() dto: SetBaselineDto,
    @Req() request: RequestWithUser,
  ) {
    return this.baselineService.setBaseline(id, dto, request.user?.sub);
  }

  @Post('baselines/:baselineId/unset')
  @Permissions('planning.baseline.manage')
  unsetBaseline(
    @Param('baselineId') baselineId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.baselineService.unsetBaseline(baselineId, request.user?.sub);
  }

  // ── Standorte ────────────────────────────────────────────────

  @Get('locations')
  @Permissions('planning.view')
  listLocations() {
    return this.orgService.list('location');
  }

  @Post('locations')
  @Permissions('planning.edit')
  createLocation(@Body() dto: CreateOrgRefDto) {
    return this.orgService.create('location', dto);
  }

  @Patch('locations/:id')
  @Permissions('planning.edit')
  updateLocation(@Param('id') id: string, @Body() dto: PatchOrgRefDto) {
    return this.orgService.update('location', id, dto);
  }

  @Delete('locations/:id')
  @Permissions('planning.edit')
  removeLocation(@Param('id') id: string) {
    return this.orgService.remove('location', id);
  }

  // ── Geschaeftseinheiten ──────────────────────────────────────

  @Get('business-units')
  @Permissions('planning.view')
  listBusinessUnits() {
    return this.orgService.list('unit');
  }

  @Post('business-units')
  @Permissions('planning.edit')
  createBusinessUnit(@Body() dto: CreateOrgRefDto) {
    return this.orgService.create('unit', dto);
  }

  @Patch('business-units/:id')
  @Permissions('planning.edit')
  updateBusinessUnit(@Param('id') id: string, @Body() dto: PatchOrgRefDto) {
    return this.orgService.update('unit', id, dto);
  }

  @Delete('business-units/:id')
  @Permissions('planning.edit')
  removeBusinessUnit(@Param('id') id: string) {
    return this.orgService.remove('unit', id);
  }
}

// ── Phase 8: Budget + Cashflow + Finanz-KPIs ────────────────────────

@Controller('planning')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class PlanningPhase8Controller {
  constructor(
    private readonly budgetService: PlanningBudgetService,
    private readonly cashflowService: PlanningCashflowService,
  ) {}

  // ── Budget-Posten ────────────────────────────────────────────

  @Get('scenarios/:id/budget-items')
  @Permissions('planning.budget.view')
  listBudget(@Param('id') id: string) {
    return this.budgetService.list(id);
  }

  @Post('scenarios/:id/budget-items')
  @Permissions('planning.budget.edit')
  createBudgetItem(
    @Param('id') id: string,
    @Body() dto: CreateBudgetItemDto,
    @Req() request: RequestWithUser,
  ) {
    return this.budgetService.create(id, dto, request.user?.sub);
  }

  @Patch('budget-items/:id')
  @Permissions('planning.budget.edit')
  updateBudgetItem(@Param('id') id: string, @Body() dto: PatchBudgetItemDto) {
    return this.budgetService.update(id, dto);
  }

  @Delete('budget-items/:id')
  @Permissions('planning.budget.edit')
  removeBudgetItem(@Param('id') id: string) {
    return this.budgetService.remove(id);
  }

  // ── Cashflow ─────────────────────────────────────────────────

  @Get('scenarios/:id/cashflow')
  @Permissions('planning.cashflow.view')
  cashflow(@Param('id') id: string, @Query('months') months?: string) {
    const horizon = months === '12' ? 12 : 6;
    return this.cashflowService.getCashflow(id, horizon);
  }

  @Get('scenarios/:id/cashflow-config')
  @Permissions('planning.cashflow.view')
  cashflowConfig(@Param('id') id: string) {
    return this.cashflowService.getConfig(id);
  }

  @Patch('scenarios/:id/cashflow-config')
  @Permissions('planning.budget.edit')
  updateCashflowConfig(
    @Param('id') id: string,
    @Body() dto: PatchCashflowConfigDto,
  ) {
    return this.cashflowService.updateConfig(id, dto);
  }

  // ── Finanz-KPIs ──────────────────────────────────────────────

  @Get('scenarios/:id/financial-kpis')
  @Permissions('planning.budget.view')
  financialKpis(@Param('id') id: string, @Query('months') months?: string) {
    const horizon = months === '12' ? 12 : 6;
    return this.cashflowService.getFinancialKpis(id, horizon);
  }
}

// ── Phase 9: Kapazitaet + Auslastung + Engpaesse ────────────────────

@Controller('planning')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class PlanningPhase9Controller {
  constructor(private readonly capacityService: PlanningCapacityService) {}

  @Get('scenarios/:id/capacity')
  @Permissions('planning.capacity.view')
  getCapacity(@Param('id') id: string) {
    return this.capacityService.getProfile(id);
  }

  @Patch('scenarios/:id/capacity')
  @Permissions('planning.capacity.edit')
  patchCapacity(@Param('id') id: string, @Body() dto: PatchCapacityProfileDto) {
    return this.capacityService.patchProfile(id, dto);
  }

  @Get('scenarios/:id/utilization')
  @Permissions('planning.capacity.view')
  getUtilization(@Param('id') id: string, @Query('weeks') weeks?: string) {
    const horizon = weeks ? Number.parseInt(weeks, 10) : 12;
    return this.capacityService.getUtilization(
      id,
      Number.isFinite(horizon) ? horizon : 12,
    );
  }

  @Get('scenarios/:id/bottlenecks')
  @Permissions('planning.capacity.view')
  getBottlenecks(
    @Param('id') id: string,
    @Query('weeks') weeks?: string,
    @Query('threshold') threshold?: string,
  ) {
    const horizon = weeks ? Number.parseInt(weeks, 10) : 12;
    const t = threshold ? Number.parseFloat(threshold) : 100;
    return this.capacityService.getBottlenecks(
      id,
      Number.isFinite(horizon) ? horizon : 12,
      Number.isFinite(t) ? t : 100,
    );
  }
}

// ── Phase 10: Vertriebs-Pipeline + Forecast ─────────────────────────

@Controller('planning')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class PlanningPhase10Controller {
  constructor(private readonly pipelineService: PlanningPipelineService) {}

  @Get('pipeline')
  @Permissions('planning.pipeline.view')
  listPipeline(
    @Query('stage') stage?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('locationId') locationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
  ) {
    return this.pipelineService.list({
      stage:
        stage && (PIPELINE_STAGES as readonly string[]).includes(stage)
          ? (stage as PipelineStage)
          : undefined,
      ownerUserId: ownerUserId === 'null' ? null : ownerUserId,
      locationId: locationId === 'null' ? null : locationId,
      businessUnitId: businessUnitId === 'null' ? null : businessUnitId,
    });
  }

  @Post('pipeline')
  @Permissions('planning.pipeline.edit')
  createPipeline(@Body() dto: CreatePipelineItemDto) {
    return this.pipelineService.create(dto);
  }

  @Patch('pipeline/:id')
  @Permissions('planning.pipeline.edit')
  updatePipeline(@Param('id') id: string, @Body() dto: PatchPipelineItemDto) {
    return this.pipelineService.update(id, dto);
  }

  @Delete('pipeline/:id')
  @Permissions('planning.pipeline.edit')
  removePipeline(@Param('id') id: string) {
    return this.pipelineService.remove(id);
  }

  @Get('pipeline/forecast')
  @Permissions('planning.pipeline.view')
  pipelineForecast(
    @Query('range') range?: string,
    @Query('scenario') scenario?: string,
  ) {
    const safeRange: PipelineRange = (
      PIPELINE_RANGES as readonly string[]
    ).includes(range ?? '')
      ? (range as PipelineRange)
      : 'month';
    const safeScenario: PipelineScenario = (
      PIPELINE_SCENARIOS as readonly string[]
    ).includes(scenario ?? '')
      ? (scenario as PipelineScenario)
      : 'base';
    return this.pipelineService.getForecast(safeRange, safeScenario);
  }
}
