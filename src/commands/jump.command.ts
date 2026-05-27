import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, jumpTo } from '../services/queue.service';
import { playCurrent } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('jump')
  .setDescription('Jump to a specific position in the queue')
  .addIntegerOption(opt => opt.setName('position').setDescription('Position number').setRequired(true).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  const position = (interaction.options.get('position')?.value as number) - 1;

  if (position < 0 || position >= queue.items.length) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Invalid position')] });
    return;
  }

  const item = jumpTo(guildId, position);
  if (item) {
    if (queue.connection?.audioPlayer) {
      queue.connection.audioPlayer.stop();
    }
    await playCurrent(guildId, interaction.channel as any);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`⏭️ Jumped to **${item.track.name}**`)] });
  }
}
