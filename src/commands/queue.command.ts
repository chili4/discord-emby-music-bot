import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getQueue } from '../services/queue.service';
import { queueEmbed } from '../utils/embed';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Show the current music queue')
  .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  const page = (interaction.options.get('page')?.value as number || 1) - 1;

  if (queue.items.length === 0) {
    await interaction.reply({ embeds: [queueEmbed([], -1, 0, 0)], ephemeral: true });
    return;
  }

  const totalPages = Math.ceil(queue.items.length / 10);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  const embed = queueEmbed(
    queue.items.map(i => i.track),
    queue.currentIndex,
    safePage,
    totalPages,
  );

  await interaction.reply({ embeds: [embed] });
}
