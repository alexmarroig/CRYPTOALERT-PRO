import { Router } from 'express';
import { getMe, updateMe } from '../../controllers/profileController.js';
import { requireAuth } from '../../middleware/auth.js';

export const profileRoutes = Router();

profileRoutes.get('/', requireAuth, getMe);
profileRoutes.patch('/', requireAuth, updateMe);
