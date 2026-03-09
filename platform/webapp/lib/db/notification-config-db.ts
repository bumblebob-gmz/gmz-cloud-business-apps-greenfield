/**
 * PostgreSQL implementation for notification config.
 * Uses a single-row upsert pattern (id = "default").
 * Used when DATABASE_URL is configured.
 */

import { getDbClient } from './client.ts';
import type { NotificationConfig } from '../notification-config.ts';

const CONFIG_ID = 'default';

export async function dbReadNotificationConfig(
  parseConfig: (raw: unknown) => NotificationConfig,
  defaultConfig: NotificationConfig
): Promise<NotificationConfig> {
  try {
    const db = getDbClient();
    const row = await db.notificationConfig.findUnique({ where: { id: CONFIG_ID } });
    if (!row) return defaultConfig;
    return parseConfig(row.config);
  } catch {
    return defaultConfig;
  }
}

export async function dbWriteNotificationConfig(config: NotificationConfig): Promise<void> {
  const db = getDbClient();

  await db.notificationConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, config: config as object },
    update: { config: config as object }
  });
}
