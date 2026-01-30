import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { profileRoutes } from './profileRoutes.js';
import { adminRoutes } from './adminRoutes.js';
import { followRoutes } from './followRoutes.js';
import { alertsRoutes } from './alertsRoutes.js';
import { postsRoutes } from './postsRoutes.js';
import { portfolioRoutes } from './portfolioRoutes.js';
import { influencerRoutes } from './influencerRoutes.js';
import { notifyRoutes } from './notifyRoutes.js';
import { billingRoutes } from './billingRoutes.js';

export const v1Routes = Router();

v1Routes.use('/me', profileRoutes);
v1Routes.use('/auth', authRoutes);
v1Routes.use('/admin', adminRoutes);
v1Routes.use('/', followRoutes);
v1Routes.use('/alerts', alertsRoutes);
v1Routes.use('/posts', postsRoutes);
v1Routes.use('/portfolio', portfolioRoutes);
v1Routes.use('/influencer', influencerRoutes);
v1Routes.use('/', notifyRoutes);
v1Routes.use('/billing', billingRoutes);
