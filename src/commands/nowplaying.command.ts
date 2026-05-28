import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getQueue, getCurrentTrack, getNextTrack } from '../services/queue.service';
import { nowPlayingEmbed } from '../utils/embed';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show the currently playing track');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  const current = getCurrentTrack(guildId);

  if (!current) {
    const emptyTrack = { id: '', name: 'Nothing playing', artist: '', album: '', albumId: '', duration: 0, imageTag: null, type: 'audio' as const };
    await interaction.reply({ embeds: [nowPlayingEmbed(emptyTrack, 0, queue.volume, undefined, null)], ephemeral: true });
    return;
  }

  const nextTrack = getNextTrack(guildId);
  let position = queue.seekOffset;
  if (queue.connection?.playingStartTime && !queue.isPaused) {
    position += Math.floor((Date.now() - queue.connection.playingStartTime) / 1000);
  }

  const embed = nowPlayingEmbed(
    current.track,
    Math.min(position, current.track.duration),
    queue.volume,
    current.requestedBy,
    nextTrack?.track ?? null,
  );

  await interaction.reply({ embeds: [embed] });
}
