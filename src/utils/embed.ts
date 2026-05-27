import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ColorResolvable } from 'discord.js';
import { Track } from '../models/types';
import { config } from '../config';

function getImageUrl(track: Track): string | null {
  if (track.imageTag && track.id) {
    return `${config.EMBY_URL}/Items/${track.id}/Images/Primary?tag=${track.imageTag}&quality=90&fillHeight=600&fillWidth=600`;
  }
  return null;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function bar(current: number, total: number, len = 14): string {
  if (total <= 0) return '▱'.repeat(len);
  const f = Math.round((current / total) * len);
  return '▰'.repeat(f) + '▱'.repeat(len - f);
}

export function nowPlayingEmbed(track: Track, position: number, volume: number, requestedBy?: string) {
  const pos = Math.min(position, track.duration);
  const progress = bar(pos, track.duration);
  const dur = track.duration > 0 ? `${fmt(pos)} / ${fmt(track.duration)}` : '0:00 / 0:00';

  const e = new EmbedBuilder()
    .setColor(0x2B2D31 as ColorResolvable)
    .setTitle(track.name)
    .addFields(
      { name: 'Artist', value: track.artist || 'Unknown', inline: true },
      { name: 'Album', value: track.album || 'Unknown', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: `${progress}`, value: `\`${dur}\``, inline: false },
    );

  if (requestedBy) {
    e.setFooter({ text: `Requested by @${requestedBy}`, iconURL: undefined });
  }

  const img = getImageUrl(track);
  if (img) e.setThumbnail(img);

  return e;
}

export function getPlaybackButtons(isPaused: boolean, loopMode: string, isFav: boolean) {
  const loopEmoji = loopMode === 'all' ? '🔁' : loopMode === 'one' ? '🔂' : '➡️';
  const loopStyle = loopMode === 'none' ? ButtonStyle.Secondary : ButtonStyle.Primary;
  const pauseId = isPaused ? 'resume' : 'pause';
  const pauseEmoji = isPaused ? '▶️' : '⏸️';

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(pauseId).setEmoji(pauseEmoji).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('next').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('rewind').setEmoji('⏪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('loop').setEmoji(loopEmoji).setStyle(loopStyle),
    new ButtonBuilder().setCustomId('forward').setEmoji('⏩').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('fav').setEmoji(isFav ? '❤️' : '🤍').setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

export function queueEmbed(tracks: Track[], currentIndex: number, page: number, totalPages: number) {
  const start = page * 10;
  const items = tracks.slice(start, start + 10);
  const lines = items.map((t, i) => {
    const n = start + i;
    const p = n === currentIndex ? '**▸**' : `**${n + 1}**`;
    return `${p} ${t.name} — ${t.artist} \`${fmt(t.duration)}\``;
  });

  return new EmbedBuilder()
    .setColor(0x2B2D31 as ColorResolvable)
    .setTitle('Queue')
    .setDescription(lines.join('\n') || 'No tracks in queue')
    .setFooter({ text: `Page ${page + 1}/${totalPages} · ${tracks.length} tracks` });
}

export function statusEmbed(fields: { name: string; value: string }[]) {
  return new EmbedBuilder()
    .setColor(0x2B2D31 as ColorResolvable)
    .setTitle('Bot Status')
    .addFields(fields);
}

export function simpleEmbed(desc: string, color: number = 0x2B2D31) {
  return new EmbedBuilder().setColor(color as ColorResolvable).setDescription(desc);
}

export function helpEmbed() {
  return new EmbedBuilder()
    .setColor(0x2B2D31 as ColorResolvable)
    .setTitle('Emby Music Bot')
    .setDescription(
      '`/play` · Search & play music\n' +
      '`/pause` · Pause / resume\n' +
      '`/skip` · Next track\n' +
      '`/previous` · Go back\n' +
      '`/stop` · Stop & clear queue\n' +
      '`/queue` · Show queue\n' +
      '`/remove` · Remove from queue\n' +
      '`/shuffle` · Shuffle queue\n' +
      '`/volume` · Set volume\n' +
      '`/seek` · Seek in track\n' +
      '`/summon` · Join your channel\n' +
      '`/disconnect` · Leave channel\n' +
      '`/search` · Search music\n' +
      '`/random` · Random tracks\n' +
      '`/nowplaying` · Current track\n' +
      '`/status` · Bot status\n' +
      '`/lyrics` · Song lyrics\n' +
      '`/fav` · Manage favorites\n' +
      '`/playlist` · Manage playlists\n' +
      '`/help` · This message',
    );
}
