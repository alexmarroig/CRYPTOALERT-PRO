import { Router } from 'express';
import { createPost, listPosts } from '../../controllers/postsController.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roleCheck.js';

export const postsRoutes = Router();

postsRoutes.get('/', listPosts);
postsRoutes.post('/', requireAuth, requireRole('influencer', 'admin'), createPost);
