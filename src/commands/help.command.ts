import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { helpEmbed } from '../utils/embed';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all available commands');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ embeds: [helpEmbed()], ephemeral: true });
}
