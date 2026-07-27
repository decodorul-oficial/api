/**
 * In-app user notifications inbox.
 */

import { GraphQLError } from 'graphql';

function toGraphQLNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    payload: row.payload || {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export class NotificationService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  async getMyNotifications(userId, { limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safeOffset = Math.max(offset, 0);

    const { data, error } = await this.supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (error) {
      throw new GraphQLError(`Eroare la încărcarea notificărilor: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return (data || []).map(toGraphQLNotification);
  }

  async unreadNotificationCount(userId) {
    const { count, error } = await this.supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      throw new GraphQLError(`Eroare la numărarea notificărilor: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return count ?? 0;
  }

  async markNotificationRead(userId, notificationId) {
    const { data, error } = await this.supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new GraphQLError(`Eroare la marcarea notificării: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    if (!data) {
      throw new GraphQLError('Notificarea nu a fost găsită', { extensions: { code: 'NOT_FOUND' } });
    }

    return toGraphQLNotification(data);
  }

  async markAllNotificationsRead(userId) {
    const { data, error } = await this.supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id');

    if (error) {
      throw new GraphQLError(`Eroare la marcarea notificărilor: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return (data || []).length;
  }

  async rateAlert(userId, notificationId, rating) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new GraphQLError('Rating invalid (1–5)', { extensions: { code: 'INVALID_INPUT' } });
    }

    const { data: existing, error: fetchError } = await this.supabase
      .from('user_notifications')
      .select('payload')
      .eq('id', notificationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !existing) {
      throw new GraphQLError('Notificarea nu a fost găsită', { extensions: { code: 'NOT_FOUND' } });
    }

    const payload = { ...(existing.payload || {}), rating, rated_at: new Date().toISOString() };

    const { error } = await this.supabase
      .from('user_notifications')
      .update({ payload })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      throw new GraphQLError(`Eroare la salvarea ratingului: ${error.message}`, {
        extensions: { code: 'DATABASE_ERROR' },
      });
    }

    return true;
  }

  async insertNotification({ userId, type, title, body, href, payload }) {
    const { data, error } = await this.supabase
      .from('user_notifications')
      .insert({
        user_id: userId,
        type,
        title,
        body: body || null,
        href: href || null,
        payload: payload || {},
      })
      .select('id')
      .single();

    if (error) {
      console.error('insertNotification failed:', error.message);
      return null;
    }

    return data?.id;
  }
}

export default NotificationService;
