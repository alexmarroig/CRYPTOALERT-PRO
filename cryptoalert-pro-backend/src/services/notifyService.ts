import { firebaseAdmin } from '../config/firebase.js';
import { supabaseAdmin } from '../config/supabase.js';

export async function notifyFollowers(creatorId: string, payload: { title: string; body: string; data?: Record<string, string> }) {
  const { data: followers, error: followersError } = await supabaseAdmin
    .from('follows')
    .select('follower_id')
    .eq('following_id', creatorId);

  if (followersError) {
    throw followersError;
  }

  const followerIds = (followers ?? []).map((row) => row.follower_id);
  if (followerIds.length === 0) {
    return;
  }

  const { data: tokens, error: tokensError } = await supabaseAdmin
    .from('push_tokens')
    .select('fcm_token')
    .in('user_id', followerIds);

  if (tokensError) {
    throw tokensError;
  }

  const messageTokens = (tokens ?? []).map((row) => row.fcm_token).filter(Boolean);
  if (messageTokens.length === 0) {
    return;
  }

  await firebaseAdmin.messaging().sendEachForMulticast({
    tokens: messageTokens,
    notification: {
      title: payload.title,
      body: payload.body
    },
    data: payload.data ?? {}
  });
}
