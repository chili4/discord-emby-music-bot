import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue } from '../services/queue.service';
import { stopScrobble } from '../services/scrobble.service';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback and clear the queue');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  if (queue.connection?.audioPlayer) {
    queue.connection.audioPlayer.stop(true);
  }
  queue.items = [];
  queue.currentIndex = -1;
  queue.isPlaying = false;
  queue.isPaused = false;
  stopScrobble(guildId);

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('⏹️ Stopped playback and cleared queue')] });
}
