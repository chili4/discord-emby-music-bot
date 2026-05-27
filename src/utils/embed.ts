import { EmbedBuilder, ColorResolvable } from 'discord.js';
import { Track } from '../models/types';
import { config } from '../config';

const COLORS = {
  primary: 0x5865F2 as ColorResolvable,
  success: 0x57F287 as ColorResolvable,
  warning: 0xFEE75C as ColorResolvable,
  error: 0xED4245 as ColorResolvable,
  info: 0x5865F2 as ColorResolvable,
};

export function nowPlayingEmbed(track: Track, position: number, volume: number, requestedBy?: string): EmbedBuilder {
  const total = track.duration;
  const bar = progressBarGen(position, total);
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('Now Playing')
    .setDescription(`**[${track.name}](${getImageUrl(track)})**`)
    .addFields(
      { name: 'Artist', value: track.artist || 'Unknown', inline: true },
      { name: 'Album', value: track.album || 'Unknown', inline: true },
      { name: 'Duration', value: `${bar} \`${formatTime(position)} / ${formatTime(total)}\``, inline: false },
      { name: 'Volume', value: `${volume}%`, inline: true },
      { name: 'Requested by', value: requestedBy ? `<@!${requestedBy}>` : 'Unknown', inline: true }
    );

  const imageUrl = getImageUrl(track);
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  return embed;
}

export function queueEmbed(tracks: Track[], currentIndex: number, page: number, totalPages: number): EmbedBuilder {
  const start = page * 10;
  const pageItems = tracks.slice(start, start + 10);
  const lines = pageItems.map((t, i) => {
    const pos = start + i;
    const prefix = pos === currentIndex ? '**▶' : `${pos + 1}`;
    return `${prefix}. ${t.name} — ${t.artist} (${formatTime(t.duration)})`;
  });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Music Queue')
    .setDescription(lines.join('\n') || 'Queue is empty')
    .setFooter({ text: `Page ${page + 1}/${totalPages} • ${tracks.length} tracks` });
}

export function trackAddedEmbed(track: Track, position: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setDescription(`✅ Added **${track.name}** by ${track.artist} (position #${position + 1})`);
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setDescription(`❌ ${message}`);
}

export function helpEmbed(): EmbedBuilder {
  const categories = [
    { name: '🎵 Playback', value: '`/play` `/pause` `/stop` `/skip` `/previous` `/jump`' },
    { name: '📋 Queue', value: '`/queue` `/remove` `/shuffle` `/clear`' },
    { name: '🔍 Search', value: '`/search` `/album` `/artist` `/random` `/playlist`' },
    { name: '🔊 Controls', value: '`/volume` `/summon` `/disconnect`' },
    { name: 'ℹ️ Info', value: '`/nowplaying` `/status` `/lyrics` `/help`' },
  ];

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Emby Music Bot - Commands')
    .setDescription('Use `/` commands to control music playback from your Emby server')
    .addFields(categories);
}

function progressBarGen(current: number, total: number, length = 16): string {
  if (total <= 0) return '░'.repeat(length);
  const filled = Math.round((current / total) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getImageUrl(track: Track): string | null {
  if (track.imageTag && track.id) {
    return `${config.EMBY_URL}/Items/${track.id}/Images/Primary?tag=${track.imageTag}&quality=90`;
  }
  return null;
}
