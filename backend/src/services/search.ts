import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { EmailRow } from '../types';

let client: Client | null = null;
let ready = false;

export function esClient(): Client | null {
  if (!env.elastic.enabled) return null;
  if (!client) client = new Client({ node: env.elastic.node, requestTimeout: 3000 });
  return client;
}

/** Creates the index with an explicit mapping. Never throws: search is an
 *  enhancement, a dead Elasticsearch must not stop emails from being sent. */
export async function initSearchIndex(): Promise<void> {
  const es = esClient();
  if (!es) return;
  try {
    const exists = await es.indices.exists({ index: env.elastic.index });
    if (!exists) {
      await es.indices.create({
        index: env.elastic.index,
        mappings: {
          properties: {
            userId: { type: 'keyword' },
            campaignId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            toEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
          },
        },
      });
    }
    ready = true;
    logger.info('search', `elasticsearch index "${env.elastic.index}" ready`);
  } catch (err) {
    ready = false;
    logger.warn('search', 'elasticsearch unavailable, falling back to Postgres search', String(err));
  }
}

export const searchReady = () => ready;

function toDoc(email: EmailRow) {
  return {
    userId: email.user_id,
    campaignId: email.campaign_id,
    senderId: email.sender_id,
    toEmail: email.to_email,
    subject: email.subject,
    body: email.body,
    status: email.status,
    scheduledAt: email.scheduled_at,
    sentAt: email.sent_at,
  };
}

export async function indexEmail(email: EmailRow): Promise<void> {
  const es = esClient();
  if (!es || !ready) return;
  try {
    await es.index({ index: env.elastic.index, id: email.id, document: toDoc(email) });
  } catch (err) {
    logger.warn('search', `index failed for ${email.id}`, String(err));
  }
}

export async function indexEmailsBulk(emails: EmailRow[]): Promise<void> {
  const es = esClient();
  if (!es || !ready || emails.length === 0) return;
  try {
    const CHUNK = 1000;
    for (let i = 0; i < emails.length; i += CHUNK) {
      const operations = emails.slice(i, i + CHUNK).flatMap((email) => [
        { index: { _index: env.elastic.index, _id: email.id } },
        toDoc(email),
      ]);
      await es.bulk({ refresh: false, operations });
    }
  } catch (err) {
    logger.warn('search', 'bulk index failed', String(err));
  }
}

/** Returns matching email ids, or null when Elasticsearch cannot serve the
 *  query so the caller can fall back to SQL. */
export async function searchEmailIds(params: {
  userId: string;
  q: string;
  statuses: string[];
  size: number;
}): Promise<{ ids: string[]; total: number } | null> {
  const es = esClient();
  if (!es || !ready) return null;
  try {
    const res = await es.search<Record<string, unknown>>({
      index: env.elastic.index,
      size: params.size,
      query: {
        bool: {
          filter: [
            { term: { userId: params.userId } },
            { terms: { status: params.statuses } },
          ],
          must: [
            {
              multi_match: {
                query: params.q,
                fields: ['toEmail^3', 'subject^2', 'body'],
                fuzziness: 'AUTO',
              },
            },
          ],
        },
      },
      sort: [{ scheduledAt: { order: 'desc' } }],
    });
    const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
    return { ids: res.hits.hits.map((h) => String(h._id)), total };
  } catch (err) {
    logger.warn('search', 'query failed, falling back to Postgres', String(err));
    return null;
  }
}
