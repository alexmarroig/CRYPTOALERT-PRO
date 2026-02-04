import { Router } from 'express';
import { seedDevData } from '../../controllers/devController.js';

export const devRoutes = Router();

devRoutes.post('/dev/seed', seedDevData);
