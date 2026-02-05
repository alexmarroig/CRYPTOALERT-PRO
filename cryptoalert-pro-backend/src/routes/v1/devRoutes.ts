import { Router } from 'express';
import { seedDevData } from '../../controllers/devController.js';
import { requireDevSeedAccess } from '../../middleware/devSeedGuard.js';

export const devRoutes = Router();

devRoutes.post('/dev/seed', requireDevSeedAccess, seedDevData);
