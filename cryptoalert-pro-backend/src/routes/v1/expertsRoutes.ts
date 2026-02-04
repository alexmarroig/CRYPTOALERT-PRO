import { Router } from 'express';
import { getExpertProfile, listExperts } from '../../controllers/expertsController.js';
import { optionalAuth } from '../../middleware/auth.js';

export const expertsRoutes = Router();

expertsRoutes.get('/experts', listExperts);
expertsRoutes.get('/experts/:username', optionalAuth, getExpertProfile);
