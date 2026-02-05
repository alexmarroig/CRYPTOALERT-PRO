import { Router } from 'express';
import {
  evaluatePreventiveAlerts,
  incidentRiskSummary,
  inferIncidentRiskBatch,
  inferIncidentRiskLive,
  ingestTelemetry,
  runIncidentBacktest,
  runIncidentRiskEtl,
  trainIncidentModel
} from '../../controllers/incidentRiskController.js';

export const incidentRiskRoutes = Router();

incidentRiskRoutes.post('/telemetry', ingestTelemetry);
incidentRiskRoutes.post('/etl/run', runIncidentRiskEtl);
incidentRiskRoutes.post('/model/train', trainIncidentModel);
incidentRiskRoutes.post('/infer/batch', inferIncidentRiskBatch);
incidentRiskRoutes.get('/infer/live', inferIncidentRiskLive);
incidentRiskRoutes.post('/alerts/evaluate', evaluatePreventiveAlerts);
incidentRiskRoutes.post('/backtest', runIncidentBacktest);
incidentRiskRoutes.get('/summary', incidentRiskSummary);
