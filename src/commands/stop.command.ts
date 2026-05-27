import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue } from '../services/queue.service';
import { stopScrobble } from '../services/scrobble.service';
import { stopNpTimer } from '../services/nowplaying.service';
import { stopAndClear } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback and clear the queue');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  await stopAndClear(guildId);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('⏹️ Stopped')] });
}