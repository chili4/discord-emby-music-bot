import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } from 'discord.js';
import { Track } from '../models/types';
import { config } from '../config';
import { embyClient } from '../client/emby.client';

const COLOR = 0x52B54B;

function imgUrl(track: Track): string | null {
  if (track.imageTag && track.id) {
    const base = config.EMBY_PUBLIC_URL || config.EMBY_URL;
    const token = embyClient.getAccessToken();
    return `${base}/Items/${track.id}/Images/Primary?tag=${track.imageTag}&quality=90&fillHeight=600&fillWidth=600&api_key=${token}`;
  }
  return null;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function bar(current: number, total: number, len = 18): string {
  if (total <= 0) return '▬'.repeat(len) + '🔘';
  const f = Math.round((current / total) * len);
  if (f === 0) return '🔘' + '▬'.repeat(len);
  if (f >= len) return '▬'.repeat(len) + '🔘';
  return '▬'.repeat(f) + '🔘' + '▬'.repeat(len - f);
}

export function nowPlayingEmbed(track: Track, position: number, volume: number, requestedBy?: string, nextTrack?: Track | null) {
  const pos = Math.min(Math.max(position, 0), track.duration);
  const progress = bar(pos, track.duration);
  const dur = track.duration > 0 ? `${fmt(pos)} / ${fmt(track.duration)}` : '0:00 / 0:00';

  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(track.name)
    .setDescription(`${track.artist || 'Unknown'} — ${track.album || 'Unknown'}`)
    .addFields(
      { name: progress, value: `\`${dur}\``, inline: false },
    );

  if (nextTrack) {
    e.addFields({ name: '▶️ Up next', value: `${nextTrack.name} — ${nextTrack.artist}`, inline: false });
  }

  if (requestedBy) {
    e.setFooter({ text: `Pedido por ${requestedBy}` });
  }

  const img = imgUrl(track);
  if (img) e.setThumbnail(img);

  return e;
}

export function getPlaybackButtons(
  isPaused: boolean,
  loopMode: string,
  isFav: boolean,
  duration?: number
) {
  const loopEmoji = loopMode === 'all' ? '🔁' : loopMode === 'one' ? '🔂' : '➡️';
  const loopStyle = loopMode === 'none' ? ButtonStyle.Secondary : ButtonStyle.Primary;
  const pauseId = isPaused ? 'resume' : 'pause';
  const pauseEmoji = isPaused ? '▶️' : '⏸️';

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prev').setEmoji('⏮️').setLabel('Prev').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(pauseId).setEmoji(pauseEmoji).setLabel(isPaused ? 'Resume' : 'Pause').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stop').setEmoji('⏹️').setLabel('Stop').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('next').setEmoji('⏭️').setLabel('Next').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('rewind').setEmoji('⏪').setLabel('-30s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('loop').setEmoji(loopEmoji).setLabel(loopMode === 'none' ? 'Off' : loopMode === 'all' ? 'All' : 'One').setStyle(loopStyle),
    new ButtonBuilder().setCustomId('forward').setEmoji('⏩').setLabel('+30s').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('fav').setEmoji(isFav ? '❤️' : '🤍').setLabel('Fav').setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('seekbar')
      .setPlaceholder('⏩ Seek to position')
      .addOptions(
        Array.from({ length: 21 }, (_, i) => i * 5).map(p => {
          const time = duration ? ` (${fmt(Math.floor(duration * (p / 100)))})` : '';
          return {
            label: `${p}%${time}`,
            value: String(p),
          };
        }),
      ),
  );

  return [row1, row2, row3];
}

export function queueEmbed(tracks: Track[], currentIndex: number, page: number, totalPages: number) {
  const start = page * 10;
  const items = tracks.slice(start, start + 10);
  const lines = items.map((t, i) => {
    const n = start + i;
    const p = n === currentIndex ? '▸' : `${n + 1}`;
    return `**${p}** ${t.name} — ${t.artist} \`${fmt(t.duration)}\``;
  });

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Queue')
    .setDescription(lines.join('\n') || 'Empty')
    .setFooter({ text: `Page ${page + 1}/${totalPages} · ${tracks.length} tracks` });
}

export function simpleEmbed(desc: string, color: number = COLOR) {
  return new EmbedBuilder().setColor(color).setDescription(desc);
}

export function helpEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Emby Music Bot')
    .setDescription(
      '`/play` · Search & play\n`/pause` · Pause / resume\n`/skip` · Next\n`/previous` · Back\n`/stop` · Stop & clear\n`/queue` · Show queue\n`/remove` · Remove from queue\n`/shuffle` · Shuffle\n`/volume` · Set volume\n`/seek` · Seek in track\n`/summon` · Join channel\n`/disconnect` · Leave\n`/search` · Search music\n`/random` · Random tracks\n`/nowplaying` · Current track\n`/status` · Bot status\n`/lyrics` · Lyrics\n`/fav` · Favorites\n`/playlist` · Playlists\n`/help` · This',
    );
}
