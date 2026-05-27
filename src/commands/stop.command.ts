import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue } from '../services/queue.service';
import { stopScrobble } from '../services/scrobble.service';
import { stopNpTimer } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback and clear the queue');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  queue.items = [];
  queue.currentIndex = -1;
  queue.isPlaying = false;
  queue.isPaused = false;
  stopScrobble(guildId);
  stopNpTimer(guildId);

  if (queue.connection?.audioPlayer) {
    queue.connection.audioPlayer.stop(true);
  }

  if (queue.npMessageId && queue.npChannelId) {
    const ch = interaction.client.channels.cache.get(queue.npChannelId) as any;
    if (ch) {
      const msg = await ch.messages.fetch(queue.npMessageId).catch(() => null);
      if (msg) await msg.edit({ components: [] }).catch(() => {});
    }
  }

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('⏹️ Stopped')] });
}