declare global {
  namespace Express {
    interface Request {
      authToken?: string;
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
