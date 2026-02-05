declare global {
  namespace Express {
    interface Request {
      authToken?: string;
      traceId?: string;
      user?: {
        id: string;
        email: string;
        role: 'user' | 'influencer' | 'admin';
        plan: 'free' | 'pro' | 'vip';
        username: string | null;
      };
    }
  }
}

export {};
