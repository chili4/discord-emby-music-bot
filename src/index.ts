import { Events, REST, Routes, ButtonInteraction } from 'discord.js';
import { discordClient } from './client/discord.client';
import { embyClient } from './client/emby.client';
import { config } from './config';
import { logger } from './utils/logger';
import { getCommandData, registerCommands } from './commands';
import {
  getQueue, getCurrentTrack, skipTrack, previousTrack,
} from './services/queue.service';
import {
  playCurrent, updateNowPlayingEmbed, stopNpTimer,
} from './services/player.service';
import { stopScrobble } from './services/scrobble.service';
import { nowPlayingEmbed, getPlaybackButtons, simpleEmbed } from './utils/embed';

process.on('unhandledRejection', (e) => logger.error('Unhandled rejection:', e));

const commands = registerCommands();
logger.debug(`Commands: ${commands.map((_, k) => k).join(', ')}`);

async function registerSlashCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(discordClient.user!.id), { body: getCommandData() });
    logger.info(`Registered ${getCommandData().length} slash commands`);
  } catch (e) {
    logger.error('Register failed:', e);
  }
}

discordClient.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${discordClient.user!.tag}`);
  await registerSlashCommands();
});

discordClient.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isCommand()) {
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return logger.warn(`Unknown command: ${interaction.commandName}`);
    try { await cmd.execute(interaction); } catch (e: any) {
      logger.error(`Error ${interaction.commandName}:`, e?.stack || e?.message);
      const r = interaction.deferred || interaction.replied
        ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction);
      await r({ embeds: [simpleEmbed('An error occurred.', 0xED4245)], ephemeral: true }).catch(() => {});
    }
  } else if (interaction.isAutocomplete()) {
    const cmd = commands.get(interaction.commandName);
    if (cmd?.autocomplete) {
      try { await cmd.autocomplete(interaction); } catch { await interaction.respond([]).catch(() => {}); }
    }
  } else if (interaction.isButton()) {
    await handleButton(interaction);
  }
});

async function handleButton(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const g = interaction.guildId!;
  const q = getQueue(g);

  switch (interaction.customId) {
    case 'pause': {
      if (q.connection?.startTime) {
        q.seekOffset += Math.floor((Date.now() - q.connection.startTime) / 1000);
      }
      q.connection?.audioPlayer?.pause();
      q.isPaused = true;
      break;
    }
    case 'resume': {
      q.connection?.audioPlayer?.unpause();
      q.isPaused = false;
      q.connection!.startTime = Date.now();
      break;
    }
    case 'next': {
      q.connection?.audioPlayer?.stop();
      const n = skipTrack(g);
      if (n) { q.seekOffset = 0; await playCurrent(g, interaction.channel as any); }
      break;
    }
    case 'prev': {
      previousTrack(g);
      q.seekOffset = 0;
      q.connection?.audioPlayer?.stop();
      await playCurrent(g, interaction.channel as any);
      break;
    }
    case 'rewind': {
      if (q.connection?.startTime) {
        q.seekOffset += Math.floor((Date.now() - q.connection.startTime) / 1000);
      }
      q.seekOffset = Math.max(0, q.seekOffset - 10);
      if (q.isPaused) {
        q.connection!.startTime = Date.now();
      } else {
        q.connection?.audioPlayer?.stop();
        q.connection!.startTime = Date.now();
        await playCurrent(g, interaction.channel as any);
      }
      break;
    }
    case 'forward': {
      const cur = getCurrentTrack(g);
      if (q.connection?.startTime) {
        q.seekOffset += Math.floor((Date.now() - q.connection.startTime) / 1000);
      }
      q.seekOffset = Math.min((cur?.track.duration || 0) - 1, q.seekOffset + 10);
      if (q.isPaused) {
        q.connection!.startTime = Date.now();
      } else {
        q.connection?.audioPlayer?.stop();
        q.connection!.startTime = Date.now();
        await playCurrent(g, interaction.channel as any);
      }
      break;
    }
    case 'stop': {
      q.items = [];
      q.currentIndex = -1;
      q.isPlaying = false;
      q.isPaused = false;
      stopScrobble(g);
      stopNpTimer(g);
      if (q.connection?.audioPlayer) q.connection.audioPlayer.stop(true);
      if (q.npMessageId && q.npChannelId) {
        const ch = interaction.client.channels.cache.get(q.npChannelId) as any;
        if (ch) {
          const msg = await ch.messages.fetch(q.npMessageId).catch(() => null);
          if (msg) await msg.edit({ components: [] }).catch(() => {});
        }
      }
      await interaction.editReply({ embeds: [], components: [] }).catch(() => {});
      return;
    }
    case 'fav': {
      const cur = getCurrentTrack(g);
      if (cur) await embyClient.addFavorite(cur.track.id);
      break;
    }
    case 'loop': {
      const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
      q.loopMode = modes[(modes.indexOf(q.loopMode) + 1) % 3];
      break;
    }
  }

  await updateNowPlayingEmbed(g);
  await interaction.editReply({}).catch(() => {});
}

(async () => {
  try {
    await embyClient.authenticate();
    await discordClient.login(config.DISCORD_TOKEN);
  } catch (e) {
    logger.error('Startup failed:', e);
    process.exit(1);
  }
})();
