import { Router } from 'express';
import { getFearGreed, getNews, getNewsCategories } from '../../controllers/newsController.js';
import { newsRateLimit } from '../../middleware/rateLimit.js';

export const newsRoutes = Router();

newsRoutes.get('/news', newsRateLimit, getNews);
newsRoutes.get('/news/categories', newsRateLimit, getNewsCategories);
newsRoutes.get('/market/fear-greed', newsRateLimit, getFearGreed);
