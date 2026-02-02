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

  // Chunk tokens (limit 500 per call for FCM)
  for (let i = 0; i < messageTokens.length; i += 500) {
    const chunk = messageTokens.slice(i, i + 500);
    await firebaseAdmin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: payload.data ?? {}
    });
  }
}

export async function sendPushNotification(userId: string, payload: { title: string; body: string; data?: Record<string, any> }) {
  const { data: tokens, error } = await supabaseAdmin
    .from('push_tokens')
    .select('fcm_token')
    .eq('user_id', userId);

  if (error || !tokens || tokens.length === 0) return;

  const fcmTokens = tokens.map((t) => t.fcm_token).filter(Boolean);
  if (fcmTokens.length === 0) return;

  const stringifiedData: Record<string, string> = {};
  if (payload.data) {
    Object.keys(payload.data).forEach(key => {
      stringifiedData[key] = String(payload.data![key]);
    });
  }

  // Chunk tokens (limit 500 per call for FCM)
  for (let i = 0; i < fcmTokens.length; i += 500) {
    const chunk = fcmTokens.slice(i, i + 500);
    await firebaseAdmin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: stringifiedData
    });
  }
}

export async function notifyAllUsers(title: string, body: string, data?: Record<string, any>) {
  const stringifiedData: Record<string, string> = {};
  if (data) {
    Object.keys(data).forEach(key => {
      stringifiedData[key] = String(data![key]);
    });
  }

  let hasMore = true;
  let offset = 0;
  const limit = 1000;

  while (hasMore) {
    const { data: tokens, error } = await supabaseAdmin
      .from('push_tokens')
      .select('fcm_token')
      .range(offset, offset + limit - 1);

    if (error || !tokens || tokens.length === 0) {
      hasMore = false;
      break;
    }

    const fcmTokens = tokens.map((t) => t.fcm_token).filter(Boolean);

    // Chunk tokens (limit 500 per call for FCM)
    for (let i = 0; i < fcmTokens.length; i += 500) {
      const chunk = fcmTokens.slice(i, i + 500);
      await firebaseAdmin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: {
          title,
          body
        },
        data: stringifiedData
      });
    }

    if (tokens.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }
}
