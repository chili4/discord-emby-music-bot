import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { playTracks } from '../services/player.service';
import { getQueue } from '../services/queue.service';
import { connectToChannel } from '../services/player.service';

export const data = new SlashCommandBuilder()
  .setName('fav')
  .setDescription('Manage your favorite tracks')
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Add a track to favorites')
    .addStringOption(opt => opt.setName('query').setDescription('Track name to search').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Remove a track from favorites')
    .addStringOption(opt => opt.setName('query').setDescription('Track name to search in favorites').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('List your favorite tracks'))
  .addSubcommand(sub => sub
    .setName('play')
    .setDescription('Play all your favorite tracks'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const member = interaction.member as any;

  if (sub === 'add') {
    const query = interaction.options.getString('query', true);
    const hints = await embyClient.search(query, 5);
    if (hints.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ No results for "${query}"`)] });
      return;
    }
    const track = hints[0];
    await embyClient.addFavorite(track.ItemId || track.Id);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`❤️ Added **${track.Name}** to favorites`)] });

  } else if (sub === 'remove') {
    const query = interaction.options.getString('query', true);
    const favorites = await embyClient.getFavorites();
    const matched = favorites.filter(i =>
      i.Name.toLowerCase().includes(query.toLowerCase()) ||
      (i.AlbumArtist || i.Artists?.[0] || '').toLowerCase().includes(query.toLowerCase()),
    );
    if (matched.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ No favorites matched "${query}"`)] });
      return;
    }
    const target = matched[0];
    await embyClient.removeFavorite(target.Id);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`💔 Removed **${target.Name}** from favorites`)] });

  } else if (sub === 'list') {
    const favorites = await embyClient.getFavorites();
    if (favorites.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('No favorites yet. Use `/fav add` to add some.')] });
      return;
    }
    const lines = favorites.slice(0, 20).map((f, i) =>
      `${i + 1}. **${f.Name}** — ${f.AlbumArtist || f.Artists?.[0] || 'Unknown'}`,
    );
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`❤️ Favorites (${favorites.length})`)
      .setDescription(lines.join('\n'));
    if (favorites.length > 20) embed.setFooter({ text: `Showing 20 of ${favorites.length}` });
    await interaction.editReply({ embeds: [embed] });

  } else if (sub === 'play') {
    if (!member?.voice?.channel) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You must be in a voice channel')] });
      return;
    }
    const favorites = await embyClient.getFavorites();
    if (favorites.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('No favorites to play.')] });
      return;
    }
    const queue = getQueue(guildId);
    if (!queue.connection) {
      const connection = await connectToChannel(member);
      if (!connection) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Could not join your voice channel')] });
        return;
      }
      queue.connection = { audioPlayer: null as any, connection, resource: null, startTime: 0 };
    }
    const tracks = favorites.map(i => embyClient.itemToTrack(i));
    await playTracks(guildId, tracks, interaction.user.id, interaction.channel as any);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`❤️ Playing **${tracks.length}** favorite tracks`)] });
  }
}
