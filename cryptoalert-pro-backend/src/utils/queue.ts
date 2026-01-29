import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import { sendPushNotification } from '../services/notifications.js';
import { logger } from './logger.js';

export const signalQueue = new Queue('signals', { connection: redis });

export const signalWorker = new Worker(
  'signals',
  async (job) => {
    const { signalId } = job.data as { signalId: string };
    const { data: signal, error: signalError } = await supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .single();

    if (signalError) {
      throw signalError;
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('id, fcm_token, subscription_tier')
      .in('subscription_tier', ['pro', 'vip']);

    if (error) {
      throw error;
    }

    await Promise.all(
      (users ?? []).map((user) =>
        sendPushNotification(user.fcm_token, signal)
      )
    );

    logger.info('Signal notifications dispatched', { signalId, usersNotified: users?.length ?? 0 });
  },
  { connection: redis }
);

signalWorker.on('failed', (job, err) => {
  logger.error('Signal job failed', { jobId: job?.id, error: err.message });
});
