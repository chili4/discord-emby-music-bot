import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { connectToChannel } from '../services/player.service';
import { getQueue } from '../services/queue.service';

export const data = new SlashCommandBuilder()
  .setName('summon')
  .setDescription('Join your current voice channel');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const member = interaction.member as any;
  const guildId = interaction.guildId!;

  if (!member?.voice?.channel) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You must be in a voice channel')] });
    return;
  }

  const connection = await connectToChannel(member);
  if (!connection) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Could not join your voice channel')] });
    return;
  }

  const queue = getQueue(guildId);
  queue.connection = {
    audioPlayer: null as any,
    connection,
    resource: null,
    startTime: 0,
    playingStartTime: 0,
  };

  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Joined **${member.voice.channel.name}**`)] });
}
