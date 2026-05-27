import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, shuffleQueue } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Shuffle the current queue');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  if (queue.items.length <= 2) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('❌ Not enough tracks to shuffle')], ephemeral: true });
    return;
  }

  shuffleQueue(guildId);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🔀 Shuffled **${queue.items.length}** tracks`)] });
}
