import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';

export async function createInvite(email: string, invitedBy: string) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('invites')
    .insert({
      email,
      token,
      status: 'pending',
      invited_by: invitedBy,
      expires_at: expiresAt
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function revokeInvite(inviteId: string) {
  const { data, error } = await supabaseAdmin
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function acceptInvite(userId: string, email: string, token: string) {
  const { data: invite, error } = await supabaseAdmin
    .from('invites')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !invite) {
    throw new Error('Invite not found');
  }

  if (invite.email !== email) {
    throw new Error('Invite email mismatch');
  }

  if (invite.status !== 'pending') {
    throw new Error('Invite is not valid');
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from('invites').update({ status: 'expired' }).eq('id', invite.id);
    throw new Error('Invite expired');
  }

  await supabaseAdmin
    .from('invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ role: 'influencer' })
    .eq('id', userId)
    .select()
    .single();

  if (profileError) {
    throw profileError;
  }

  return profile;
}
