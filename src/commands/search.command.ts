import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { searchAndResolve } from '../services/search.service';
import { addTrack } from '../services/queue.service';
import { playTracks } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for music on Emby')
  .addStringOption(opt => opt.setName('query').setDescription('Search term').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const query = interaction.options.get('query')?.value as string;
  const guildId = interaction.guildId!;
  const member = interaction.member as any;

  const result = await searchAndResolve(query);

  if (result.tracks.length === 0) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ No results for "${query}"`)] });
    return;
  }

  if (!member?.voice?.channel) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You must be in a voice channel')] });
    return;
  }

  await playTracks(guildId, result.tracks, interaction.user.id, interaction.channel as any);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Enqueued **${result.tracks.length}** tracks`)] });
}
