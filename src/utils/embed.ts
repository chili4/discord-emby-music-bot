import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ColorResolvable } from 'discord.js';
import { Track } from '../models/types';
import { config } from '../config';

const COLORS = {
  primary: 0x5865F2 as ColorResolvable,
  success: 0x57F287 as ColorResolvable,
  warning: 0xFEE75C as ColorResolvable,
  error: 0xED4245 as ColorResolvable,
  info: 0x5865F2 as ColorResolvable,
};

function getImageUrl(track: Track): string | null {
  if (track.imageTag && track.id) {
    return `${config.EMBY_URL}/Items/${track.id}/Images/Primary?tag=${track.imageTag}&quality=90&fillHeight=300&fillWidth=300`;
  }
  return null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function progressBar(current: number, total: number, length = 12): string {
  if (total <= 0) return '▱'.repeat(length);
  const filled = Math.round((current / total) * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

export function nowPlayingEmbed(track: Track, position: number, volume: number, requestedBy?: string) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setAuthor({ name: 'Now Playing', iconURL: 'https://cdn.discordapp.com/emojis/1015745804344639628.gif' })
    .setTitle(track.name)
    .addFields(
      { name: 'Artist', value: track.artist || 'Unknown', inline: true },
      { name: 'Album', value: track.album || 'Unknown', inline: true },
      { name: 'Duration', value: `${progressBar(position, track.duration)} \`${formatTime(position)} / ${formatTime(track.duration)}\``, inline: false },
      { name: 'Volume', value: `${volume}%`, inline: true },
    );

  if (requestedBy) {
    embed.addFields({ name: 'Requested', value: `<@!${requestedBy}>`, inline: true });
  }

  const imageUrl = getImageUrl(track);
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  return embed;
}

export function getPlaybackButtons(isPaused: boolean, loopMode: string, isFav: boolean) {
  const loopLabel = loopMode === 'all' ? '🔁' : loopMode === 'one' ? '🔂' : '➡️';
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
    new ButtonBuilder().setCustomId('loop').setEmoji(loopLabel).setStyle(loopStyle),
    new ButtonBuilder().setCustomId('fav').setEmoji(isFav ? '❤️' : '🤍').setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
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
    { name: '🔍 Search', value: '`/search` `/random` `/fav` `/playlist`' },
    { name: '🔊 Controls', value: '`/volume` `/summon` `/disconnect`' },
    { name: 'ℹ️ Info', value: '`/nowplaying` `/status` `/lyrics` `/help`' },
  ];

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Emby Music Bot - Commands')
    .setDescription('Use `/` commands to control music playback from your Emby server.\nOr use the buttons below the Now Playing message!')
    .addFields(categories);
}
