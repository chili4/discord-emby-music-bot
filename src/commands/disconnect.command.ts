import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { disconnect } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('disconnect')
  .setDescription('Disconnect from the voice channel');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  disconnect(guildId);

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('👋 Disconnected')] });
}
