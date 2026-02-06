declare global {
  namespace Express {
    interface Request {
      authToken?: string;
      traceId?: string;
      requestId?: string;
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
