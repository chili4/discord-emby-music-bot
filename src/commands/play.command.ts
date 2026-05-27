import { ChatInputCommandInteraction, AutocompleteInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchAndResolve, searchAutocomplete } from '../services/search.service';
import { playTracks, connectToChannel } from '../services/player.service';
import { addTrack, addTrackNext, getQueue } from '../services/queue.service';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Search and play music from your Emby server')
  .addStringOption(opt => opt.setName('name').setDescription('Song, album, or playlist name').setRequired(true).setAutocomplete(true))
  .addBooleanOption(opt => opt.setName('next').setDescription('Add to the start of the playlist').setRequired(false))
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
  const query = interaction.options.getString('name', true);
  const next = interaction.options.getBoolean('next') || false;
  const type = interaction.options.getInteger('type') ?? undefined;

  logger.debug(`Play params: query="${query}", next=${next}, type=${type}`);

  if (!member?.voice?.channel) {
    logger.debug('User not in voice channel');
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You must be in a voice channel')] });
    return;
  }

  const queue = getQueue(guildId);
  if (!queue.connection) {
    logger.debug('No voice connection, attempting to join');
    const connection = await connectToChannel(member);
    if (!connection) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Could not join your voice channel')] });
      return;
    }
    queue.connection = { audioPlayer: null as any, connection, resource: null, startTime: 0 };
  }

  logger.debug(`Searching for: "${query}"`);
  const result = await searchAndResolve(query, type);
  logger.debug(`Search returned ${result.tracks.length} tracks (type: ${result.type})`);

  if (result.tracks.length === 0) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ No results found for "${query}"`)] });
    return;
  }

  if (next && result.tracks.length === 1) {
    const track = result.tracks[0];
    addTrackNext(guildId, track, interaction.user.id);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ **${track.name}** will play next`)] });
    return;
  }

  logger.debug(`Playing ${result.tracks.length} tracks`);
  await playTracks(guildId, result.tracks, interaction.user.id, interaction.channel as any);
  const count = result.tracks.length;
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Enqueued **${count}** track${count > 1 ? 's' : ''} (${result.type})`)] });
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
