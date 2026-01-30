import type { Request, Response } from 'express';
import { FeedService } from '../services/feed.js';

const feedService = new FeedService();

export async function getFeed(_req: Request, res: Response) {
  try {
    const feed = await feedService.getFeed();
    return res.json(feed);
  } catch {
    return res.status(502).json({ error: 'Failed to fetch feed' });
  }
}
