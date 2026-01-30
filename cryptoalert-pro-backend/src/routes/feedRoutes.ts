import { Router } from 'express';
import { getFeed } from '../controllers/feedController.js';

export const feedRoutes = Router();

feedRoutes.get('/', getFeed);
