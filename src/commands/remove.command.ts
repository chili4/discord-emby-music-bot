import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, removeTrack } from '../services/queue.service';

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

  const track = removeTrack(guildId, position);
  if (track) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed **${track.name}** from queue`)] });
  }
}
