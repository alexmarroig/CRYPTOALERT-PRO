import { Router } from 'express';
import { follow, getFriendRanking, listFollowers, listFollowing, unfollow } from '../../controllers/followController.js';
import { requireAuth } from '../../middleware/auth.js';

export const followRoutes = Router();

followRoutes.post('/follow', requireAuth, follow);
followRoutes.delete('/follow/:followingId', requireAuth, unfollow);
followRoutes.get('/following', requireAuth, listFollowing);
followRoutes.get('/followers', requireAuth, listFollowers);
followRoutes.get('/ranking/friends', requireAuth, getFriendRanking);
