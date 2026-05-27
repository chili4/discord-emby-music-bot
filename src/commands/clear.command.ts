import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, clearQueue } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Clear the entire queue');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  if (queue.items.length === 0) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('❌ Queue is already empty')], ephemeral: true });
    return;
  }

  clearQueue(guildId);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('🗑️ Queue cleared')] });
}
