import { Router } from 'express';
import { getSocialRanking } from '../../controllers/rankingController.js';

export const rankingRoutes = Router();

rankingRoutes.get('/ranking', getSocialRanking);
