import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause or resume playback');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  if (!queue.connection?.audioPlayer) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Nothing is playing')], ephemeral: true });
    return;
  }

  const player = queue.connection.audioPlayer;

  if (queue.isPaused) {
    player.unpause();
    queue.isPaused = false;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('▶️ Resumed')] });
  } else {
    player.pause();
    queue.isPaused = true;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⏸️ Paused')] });
  }
}
