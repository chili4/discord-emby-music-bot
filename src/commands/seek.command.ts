import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, getCurrentTrack } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('seek')
  .setDescription('Seek to a specific position in the current track (in seconds)')
  .addIntegerOption(opt => opt.setName('position').setDescription('Position in seconds').setRequired(true).setMinValue(0));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  const current = getCurrentTrack(guildId);

  if (!current || !queue.connection?.connection) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Nothing is playing')] });
    return;
  }

  const target = interaction.options.getInteger('position', true);
  if (target >= current.track.duration) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Track is only ${current.track.duration}s long`)] });
    return;
  }

  queue.skipGuard = true;
  if (queue.connection?.audioPlayer) {
    queue.connection.audioPlayer.stop();
  }

  queue.seekOffset = target;

  const { playCurrent } = await import('../services/player.service');
  await playCurrent(guildId);

  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`⏩ Seeked to **${target}s**`)] });
}
