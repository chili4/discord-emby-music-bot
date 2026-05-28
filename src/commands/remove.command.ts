import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, removeTrack } from '../services/queue.service';
import { playCurrent } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove a track from the queue by position')
  .addIntegerOption(opt => opt.setName('position').setDescription('Position number').setRequired(true).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  const position = (interaction.options.get('position')?.value as number) - 1;

  if (position < 0 || position >= queue.items.length) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Invalid position')], ephemeral: true });
    return;
  }

  const removed = removeTrack(guildId, position);

  if (!removed) return;

  if (position === queue.currentIndex && queue.isPlaying) {
    const { skipTrack } = await import('../services/queue.service');
    const next = skipTrack(guildId);
    if (next) {
      queue.seekOffset = 0;
      await playCurrent(guildId, interaction.channel as any);
    } else {
      queue.isPlaying = false;
    }
  }

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed **${removed.name}** from queue`)] });
}
