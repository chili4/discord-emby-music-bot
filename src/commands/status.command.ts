import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, version as djsVersion } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { discordClient } from '../client/discord.client';
import { getQueue } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show bot and server status');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Bot Status')
    .addFields(
      { name: 'Bot Version', value: '1.0.0', inline: true },
      { name: 'Discord.js', value: `v${djsVersion}`, inline: true },
      { name: 'Discord Ping', value: `${discordClient.ws.ping}ms`, inline: true },
      { name: 'Bot Uptime', value: uptimeStr, inline: true },
      { name: 'Emby Connected', value: '✅ Yes', inline: true },
      { name: 'Queue', value: `${queue.items.length} tracks`, inline: true },
      { name: 'Status', value: queue.isPlaying ? '▶️ Playing' : queue.isPaused ? '⏸️ Paused' : '⏹️ Idle', inline: true },
      { name: 'Volume', value: `${queue.volume}%`, inline: true },
      { name: 'Loop', value: queue.loopMode === 'all' ? '🔁 All' : queue.loopMode === 'one' ? '🔂 One' : '❌ None', inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}
