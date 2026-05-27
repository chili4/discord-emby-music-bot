import { ChatInputCommandInteraction, AutocompleteInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { embyClient } from '../client/emby.client';
import { playTracks, connectToChannel } from '../services/player.service';
import { getQueue } from '../services/queue.service';
import { Track, EmbyItem } from '../models/types';

const playlistNameOption = (opt: any) =>
  opt.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true);

export const data = new SlashCommandBuilder()
  .setName('playlist')
  .setDescription('Manage your playlists')
  .addSubcommand(sub => sub
    .setName('create')
    .setDescription('Create a new playlist')
    .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Add a track to a playlist')
    .addStringOption(playlistNameOption)
    .addStringOption(opt => opt.setName('query').setDescription('Track name to search').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Remove a track from a playlist by position')
    .addStringOption(playlistNameOption)
    .addIntegerOption(opt => opt.setName('position').setDescription('Position to remove (1-based)').setRequired(true).setMinValue(1)))
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('List all your playlists'))
  .addSubcommand(sub => sub
    .setName('view')
    .setDescription('View contents of a playlist')
    .addStringOption(playlistNameOption))
  .addSubcommand(sub => sub
    .setName('play')
    .setDescription('Play a playlist (or "favorites")')
    .addStringOption(playlistNameOption)
    .addStringOption(opt => opt.setName('sort').setDescription('Sort order').setRequired(false)
      .addChoices(
        { name: 'Normal', value: 'normal' },
        { name: 'Random', value: 'random' },
        { name: 'A-Z', value: 'name' },
        { name: 'Newest', value: 'newest' },
      )))
  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('Delete a playlist')
    .addStringOption(playlistNameOption));

async function resolvePlaylist(interaction: ChatInputCommandInteraction): Promise<{ id: string; name: string } | null> {
  const name = interaction.options.getString('name', true);
  const playlists = await embyClient.getPlaylists();
  const match = playlists.find(p => p.Name.toLowerCase() === name.toLowerCase());
  if (!match) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Playlist "${name}" not found`)] });
    return null;
  }
  return { id: match.Id, name: match.Name };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const member = interaction.member as any;

  if (sub === 'create') {
    const name = interaction.options.getString('name', true);
    const id = await embyClient.createPlaylist(name);
    if (id) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`📝 Created playlist **${name}**`)] });
    } else {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Failed to create playlist')] });
    }

  } else if (sub === 'add') {
    const query = interaction.options.getString('query', true);
    const playlist = await resolvePlaylist(interaction);
    if (!playlist) return;

    const hints = await embyClient.search(query, 5);
    if (hints.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ No results for "${query}"`)] });
      return;
    }
    const track = hints[0];
    await embyClient.addToPlaylist(playlist.id, [track.ItemId || track.Id]);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Added **${track.Name}** to **${playlist.name}**`)] });

  } else if (sub === 'remove') {
    const position = interaction.options.getInteger('position', true);
    const playlist = await resolvePlaylist(interaction);
    if (!playlist) return;

    const items = await embyClient.getPlaylistItems(playlist.id);
    if (position < 1 || position > items.length) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Invalid position. Playlist has ${items.length} tracks.`)] });
      return;
    }
    const target = items[position - 1];
    const entryIds = target.PlaylistItemId ? [target.PlaylistItemId] : [target.Id];
    await embyClient.removeFromPlaylist(playlist.id, entryIds);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`🗑️ Removed **${target.Name}** (position ${position}) from **${playlist.name}**`)] });

  } else if (sub === 'list') {
    const playlists = await embyClient.getPlaylists();
    if (playlists.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('No playlists yet. Use `/playlist create` to make one.')] });
      return;
    }
    const lines = playlists.map((p, i) => `${i + 1}. **${p.Name}**`);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Your Playlists').setDescription(lines.join('\n'))] });

  } else if (sub === 'view') {
    const playlist = await resolvePlaylist(interaction);
    if (!playlist) return;

    const items = await embyClient.getPlaylistItems(playlist.id);
    if (items.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`**${playlist.name}** is empty.`)] });
      return;
    }
    const lines = items.slice(0, 30).map((item, i) =>
      `${i + 1}. **${item.Name}** — ${item.AlbumArtist || item.Artists?.[0] || 'Unknown'}`,
    );
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📋 ${playlist.name} (${items.length} tracks)`)
      .setDescription(lines.join('\n'));
    if (items.length > 30) embed.setFooter({ text: `Showing 30 of ${items.length}` });
    await interaction.editReply({ embeds: [embed] });

  } else if (sub === 'play') {
    const name = interaction.options.getString('name', true);
    const sort = interaction.options.getString('sort') || 'normal';

    if (!member?.voice?.channel) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You must be in a voice channel')] });
      return;
    }

    let items: EmbyItem[];
    let label: string;

    if (name.toLowerCase() === 'favorites') {
      items = await embyClient.getFavorites();
      label = 'Favorites';
    } else {
      const playlist = await resolvePlaylist(interaction);
      if (!playlist) return;
      items = await embyClient.getPlaylistItems(playlist.id);
      label = playlist.name;
    }

    if (items.length === 0) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`**${label}** is empty.`)] });
      return;
    }

    // Apply sort
    let sorted = [...items];
    if (sort === 'random') {
      sorted.sort(() => Math.random() - 0.5);
    } else if (sort === 'name') {
      sorted.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    } else if (sort === 'newest') {
      sorted.sort((a, b) => (b.ProductionYear || 0) - (a.ProductionYear || 0));
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
    const tracks = sorted.map(i => embyClient.itemToTrack(i));
    await playTracks(guildId, tracks, interaction.user.id, interaction.channel as any);
    const sortLabel = sort !== 'normal' ? ` (${sort})` : '';
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`▶️ Playing **${label}**${sortLabel} — ${tracks.length} tracks`)] });

  } else if (sub === 'delete') {
    const playlist = await resolvePlaylist(interaction);
    if (!playlist) return;

    await embyClient.deletePlaylist(playlist.id);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`🗑️ Deleted playlist **${playlist.name}**`)] });
  }
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const results: { name: string; value: string }[] = [];

  // Always suggest "favorites" if it matches
  if ('favorites'.includes(focused)) {
    results.push({ name: '⭐ Favorites', value: 'favorites' });
  }

  const playlists = await embyClient.getPlaylists();
  for (const p of playlists) {
    if (p.Name.toLowerCase().includes(focused)) {
      results.push({ name: p.Name, value: p.Name });
      if (results.length >= 10) break;
    }
  }

  await interaction.respond(results.slice(0, 10));
}
