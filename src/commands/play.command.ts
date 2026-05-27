import { ChatInputCommandInteraction, AutocompleteInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchAndResolve, searchAutocomplete } from '../services/search.service';
import { playTracks, connectToChannel } from '../services/player.service';
import { addTrackNext, getQueue } from '../services/queue.service';
import { logger } from '../utils/logger';
import { embyClient } from '../client/emby.client';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Search and play music from your Emby server')
  .addStringOption(opt => opt.setName('name').setDescription('Song, album, or playlist name').setRequired(true).setAutocomplete(true))
  .addBooleanOption(opt => opt.setName('next').setDescription('Add to the start of the playlist').setRequired(false))
  .addBooleanOption(opt => opt.setName('now').setDescription('Replace current track with this one').setRequired(false))
  .addIntegerOption(opt => opt.setName('type').setDescription('Desired item type').setRequired(false)
    .addChoices(
      { name: 'Audio', value: 0 },
      { name: 'AudioAlbum', value: 1 },
      { name: 'Playlist', value: 2 },
      { name: 'Artist', value: 4 },
    ));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  logger.debug(`Play command received from ${interaction.user.tag}`);
  await interaction.deferReply();
  logger.debug('Play command deferred');

  const member = interaction.member as any;
  const guildId = interaction.guildId!;
  const raw = interaction.options.getString('name', true);
  const next = interaction.options.getBoolean('next') || false;
  const now = interaction.options.getBoolean('now') || false;
  const type = interaction.options.getInteger('type') ?? undefined;

  logger.debug(`Play params: query="${raw}", next=${next}, type=${type}`);

  if (!member?.voice?.channel) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You must be in a voice channel')] });
    return;
  }

  const queue = getQueue(guildId);
  if (!queue.connection) {
    const connection = await connectToChannel(member);
    if (!connection) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Could not join your voice channel')] });
      return;
    }
    queue.connection = { audioPlayer: null as any, connection, resource: null, startTime: 0 };
  }

  // Parse "ID||Name" format from autocomplete
  const pipeIdx = raw.indexOf('||');
  let itemId: string | null = null;
  let searchQuery = raw;

  if (pipeIdx !== -1) {
    itemId = raw.slice(0, pipeIdx);
    searchQuery = raw.slice(pipeIdx + 2);
  }

  let tracksToPlay: import('../models/types').Track[];

  if (itemId && /^\d+$/.test(itemId)) {
    // Look up by exact ID
    const item = await embyClient.getItem(itemId);
    logger.debug(`getItem(${itemId}): IsFavorite=${item?.IsFavorite}, type=${item?.Type}`);
    if (item && item.Type === 'Audio') {
      tracksToPlay = [embyClient.itemToTrack(item)];
    } else if (item && item.Type === 'MusicAlbum') {
      const items = await embyClient.getAlbumItems(itemId);
      tracksToPlay = items.map(i => embyClient.itemToTrack(i));
    } else if (item) {
      tracksToPlay = [embyClient.itemToTrack(item)];
    } else {
      // ID lookup failed, fall back to search
      const result = await searchAndResolve(searchQuery, type);
      tracksToPlay = result.tracks;
    }
  } else {
    // Search by name
    const result = await searchAndResolve(searchQuery, type);
    tracksToPlay = result.tracks;
  }

  if (tracksToPlay.length === 0) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ No results`)] });
    return;
  }

  // If list of individual tracks, only take first
  if (tracksToPlay.length > 1 && tracksToPlay.every(t => t.type === 'audio')) {
    tracksToPlay = [tracksToPlay[0]];
  }

  const first = tracksToPlay[0];

  if (next) {
    addTrackNext(guildId, first, interaction.user.id);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ **${first.name}** will play next`)] });
    return;
  }

  // 'now' flag: replace current queue and play immediately
  if (now) {
    const { stopAndClear } = await import('../services/player.service');
    await stopAndClear(guildId);
    // Re-connect after clearing
    const connection = await connectToChannel(member);
    if (connection) {
      getQueue(guildId).connection = { audioPlayer: null as any, connection, resource: null, startTime: 0 };
    }
  }

  const qWasEmpty = getQueue(guildId).items.length === 0;
  await playTracks(guildId, tracksToPlay, interaction.user.id, interaction.channel as any);
  const count = tracksToPlay.length;
  const desc = qWasEmpty
    ? (count > 1 ? `✅ Playing **${first.name}** (${count} tracks)` : `✅ Playing **${first.name}**`)
    : `✅ **${first.name}** added to queue`;
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(desc)] });
  const q = getQueue(guildId);
  q.npChannelId = q.npChannelId || interaction.channelId;
  logger.debug('Play command completed');
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const query = interaction.options.getFocused();
  if (!query) {
    await interaction.respond([]);
    return;
  }
  const type = interaction.options.get('type')?.value as number | undefined;
  const choices = await searchAutocomplete(query, type);
  await interaction.respond(choices.map(c => ({ name: c.name, value: c.value })));
}
