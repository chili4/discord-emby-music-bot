import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { setVolume } from '../services/player.service';
import { getQueue } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set the playback volume (0-150)')
  .addIntegerOption(opt => opt.setName('volume').setDescription('Volume level').setRequired(true).setMinValue(0).setMaxValue(150));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const volume = interaction.options.get('volume')?.value as number;

  setVolume(guildId, volume);

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(`🔊 Volume set to **${volume}%**`)
      .setFooter({ text: volume > 100 ? 'Warning: High volume may cause distortion' : '' })],
  });
}
