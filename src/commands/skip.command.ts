import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue, skipTrack } from '../services/queue.service';
import { playCurrent } from '../services/player.service';
import { getCurrentTrack } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the current track');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  if (!queue.isPlaying) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Nothing is playing')] });
    return;
  }

  if (queue.connection?.audioPlayer) {
    queue.connection.audioPlayer.stop();
  }

  const next = skipTrack(guildId);
  if (next) {
    await playCurrent(guildId, interaction.channel as any);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('⏭️ Skipped')] });
  } else {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⏭️ Skipped — No more tracks in queue')] });
  }
}
