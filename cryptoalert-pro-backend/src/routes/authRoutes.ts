import { Router } from 'express';
import { login, me, signup } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

export const authRoutes = Router();

authRoutes.post('/signup', signup);

authRoutes.post('/login', login);

authRoutes.get('/me', requireAuth, me);
