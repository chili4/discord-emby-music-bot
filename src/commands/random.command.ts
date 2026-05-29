import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { playTracks } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('random')
  .setDescription('Add random tracks to the queue')
  .addIntegerOption(opt => opt.setName('count').setDescription('Number of tracks').setRequired(false).setMinValue(1).setMaxValue(50));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const member = interaction.member as any;
  const count = (interaction.options.get('count')?.value as number) || 10;

  if (!member?.voice?.channel) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You must be in a voice channel')] });
    return;
  }

  const items = await embyClient.getRandomTracks(count);
  if (items.length === 0) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ No random tracks found')] });
    return;
  }

  const tracks = items.map(i => embyClient.itemToTrack(i));
  await playTracks(guildId, tracks, (interaction.member as any)?.displayName || interaction.user.username, interaction.channel as any);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🎲 Added **${tracks.length}** random tracks`)] });
}
