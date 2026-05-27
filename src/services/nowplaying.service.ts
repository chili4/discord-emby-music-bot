import { TextChannel, Message, ActionRowBuilder, ButtonBuilder, ComponentType, ActionRow } from 'discord.js';
import { logger } from '../utils/logger';
import { getQueue, getCurrentTrack } from './queue.service';
import { nowPlayingEmbed, getPlaybackButtons } from '../utils/embed';
import { embyClient } from '../client/emby.client';

async function resolveChannel(guildId: string): Promise<TextChannel | null> {
  const q = getQueue(guildId);
  if (q.npChannelId) {
    const { discordClient } = await import('../client/discord.client');
    const ch = discordClient.channels.cache.get(q.npChannelId) as TextChannel;
    if (ch) return ch;
  }
  return null;
}

async function resolveMessage(guildId: string): Promise<Message | null> {
  const q = getQueue(guildId);
  if (!q.npMessageId || !q.npChannelId) return null;
  const ch = await resolveChannel(guildId);
  if (!ch) return null;
  const msg = await ch.messages.fetch(q.npMessageId).catch(() => null);
  return msg;
}

function calcPosition(guildId: string): number {
  const q = getQueue(guildId);
  let pos = q.seekOffset;
  if (q.connection?.startTime && !q.isPaused) {
    pos += Math.floor((Date.now() - q.connection.startTime) / 1000);
  }
  const cur = getCurrentTrack(guildId);
  return Math.min(pos, cur?.track.duration || 0);
}

export async function sendNP(channel: TextChannel, guildId: string): Promise<Message | null> {
  const q = getQueue(guildId);
  const cur = getCurrentTrack(guildId);
  if (!cur) return null;

  let isFav = cur.track.isFavorite || false;
  // If we don't know the fav status yet (initial state from API was false/unset),
  // explicitly check it from Emby for accuracy.
  if (!cur.track.isFavorite) {
    const apiFav = await embyClient.isFavorite(cur.track.id).catch(() => false);
    if (apiFav) {
      cur.track.isFavorite = true;
      isFav = true;
    }
  }
  logger.debug(`sendNP: ${cur.track.name} fav=${isFav}`);
  const embed = nowPlayingEmbed(cur.track, calcPosition(guildId), q.volume, cur.requestedBy);
  const rows = getPlaybackButtons(q.isPaused, q.loopMode, isFav);

  // Try to update existing NP message first (avoids duplicate messages)
  const existing = await resolveMessage(guildId);
  if (existing) {
    await existing.edit({ embeds: [embed], components: rows }).catch(() => {});
    return existing;
  }

  const msg = await channel.send({ embeds: [embed], components: rows }).catch((e: any) => {
    logger.error(`sendNP failed: ${e.message}`);
    return null;
  });

  if (msg) {
    q.npMessageId = msg.id;
    q.npChannelId = msg.channelId;
  }
  return msg;
}

export async function updateNP(guildId: string, overrideFav?: boolean): Promise<void> {
  const q = getQueue(guildId);
  const cur = getCurrentTrack(guildId);
  if (!cur || !q.npMessageId) return;

  const msg = await resolveMessage(guildId);
  if (!msg) {
    const ch = await resolveChannel(guildId);
    if (ch) await sendNP(ch, guildId);
    return;
  }

  const isFav = overrideFav ?? (cur.track.isFavorite || false);

  const embed = nowPlayingEmbed(cur.track, calcPosition(guildId), q.volume, cur.requestedBy);
  const rows = getPlaybackButtons(q.isPaused, q.loopMode, isFav);
  await msg.edit({ embeds: [embed], components: rows }).catch(() => {});
}

export async function disableNP(guildId: string): Promise<void> {
  const msg = await resolveMessage(guildId);
  if (!msg) return;

  const disabledRows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (const row of msg.components as ActionRow<any>[]) {
    if (!row.components) continue;
    const newRow = new ActionRowBuilder<ButtonBuilder>();
    for (const comp of row.components) {
      if (comp.type !== ComponentType.Button) continue;
      const btn = comp as any;
      const b = new ButtonBuilder()
        .setCustomId(btn.customId || 'x')
        .setStyle(btn.style)
        .setDisabled(true);
      if (btn.emoji) {
        b.setEmoji(btn.emoji.name || btn.emoji.id || '❓');
      } else if (btn.label) {
        b.setLabel(btn.label);
      }
      newRow.addComponents(b);
    }
    if (newRow.components.length > 0) disabledRows.push(newRow);
  }

  await msg.edit({ components: disabledRows }).catch(() => {});
}

export async function clearNP(guildId: string): Promise<void> {
  const msg = await resolveMessage(guildId);
  if (!msg) return;
  await msg.edit({ components: [] }).catch(() => {});
}

export function startNpTimer(guildId: string): void {
  stopNpTimer(guildId);
  const q = getQueue(guildId);
  q.npTimer = setInterval(() => updateNP(guildId), 10_000);
}

export function stopNpTimer(guildId: string): void {
  const q = getQueue(guildId);
  if (q.npTimer) {
    clearInterval(q.npTimer);
    q.npTimer = null;
  }
}
