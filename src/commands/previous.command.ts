import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, previousTrack } from '../services/queue.service';
import { playCurrent } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('previous')
  .setDescription('Go back to the previous track');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  if (queue.items.length === 0) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Queue is empty')] });
    return;
  }

  const prev = previousTrack(guildId);
  if (prev) {
    if (queue.connection?.audioPlayer) {
      queue.connection.audioPlayer.stop();
    }
    await playCurrent(guildId, interaction.channel as any);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('⏮️ Playing previous track')] });
  } else {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ No previous track')] });
  }
}
