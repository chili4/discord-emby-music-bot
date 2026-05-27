import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getCurrentTrack } from '../services/queue.service';
import { fetchLyrics } from '../services/lyrics.service';

export const data = new SlashCommandBuilder()
  .setName('lyrics')
  .setDescription('Show lyrics for the current or specified track')
  .addStringOption(opt => opt.setName('title').setDescription('Song title (optional)').setRequired(false))
  .addStringOption(opt => opt.setName('artist').setDescription('Artist name (optional)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const guildId = interaction.guildId!;

  let title = interaction.options.get('title')?.value as string;
  let artist = interaction.options.get('artist')?.value as string;

  if (!title) {
    const current = getCurrentTrack(guildId);
    if (!current) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ No track playing and no title specified')] });
      return;
    }
    title = current.track.name;
    artist = current.track.artist;
  }

  const lyrics = await fetchLyrics(artist, title);
  if (!lyrics) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`❌ No lyrics found for **${title}** by ${artist}`)] });
    return;
  }

  const truncated = lyrics.length > 4000 ? lyrics.slice(0, 4000) + '...' : lyrics;

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Lyrics - ${title}`)
      .setDescription(`\`\`\`${truncated}\`\`\``)
      .setFooter({ text: artist })],
  });
}
