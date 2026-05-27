import { Events, REST, Routes, ButtonInteraction } from 'discord.js';
import { discordClient } from './client/discord.client';
import { embyClient } from './client/emby.client';
import { config } from './config';
import { logger } from './utils/logger';
import { getCommandData, registerCommands } from './commands';
import { getQueue, getCurrentTrack, skipTrack, previousTrack } from './services/queue.service';
import { playCurrent, setVolume, updateNowPlayingEmbed, stopNpTimer, setDiscordClient } from './services/player.service';
import { nowPlayingEmbed, getPlaybackButtons } from './utils/embed';
import { stopScrobble } from './services/scrobble.service';

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});

const commands = registerCommands();
logger.debug(`Commands in collection: ${commands.map((_, k) => k).join(', ')}`);

let nowPlayingMessageId: string | null = null; // Track the last NP message per guild
const npMessages = new Map<string, string>();

async function updateNowPlaying(guildId: string) {
  const queue = getQueue(guildId);
  const current = getCurrentTrack(guildId);
  if (!current) return;

  const position = queue.connection?.startTime
    ? Math.floor((Date.now() - queue.connection.startTime) / 1000)
    : 0;

  const channelId = npMessages.get(guildId); // We'll set this when sending
  // For button updates, the interaction channels are used directly
}

async function registerSlashCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    const data = getCommandData();
    await rest.put(Routes.applicationCommands(discordClient.user!.id), { body: data });
    logger.info(`Registered ${data.length} slash commands`);
  } catch (err) {
    logger.error('Failed to register slash commands:', err);
  }
}

discordClient.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${discordClient.user!.tag}`);
  setDiscordClient(discordClient);
  await registerSlashCommands();
});

discordClient.on(Events.InteractionCreate, async (interaction) => {
  logger.debug(`Interaction received: type=${interaction.type}, name=${(interaction as any).commandName || 'N/A'}, user=${interaction.user.tag}`);

  if (interaction.isCommand()) {
    const cmdName = interaction.commandName;
    logger.debug(`Command interaction: "${cmdName}"`);

    if (!commands.has(cmdName)) {
      logger.warn(`Command "${cmdName}" not found in collection. Available: ${commands.map((_, k) => k).join(', ')}`);
      return;
    }

    const command = commands.get(cmdName)!;

    try {
      await command.execute(interaction);

      // Track the channel for now-playing updates
      if (cmdName === 'play' && interaction.channel) {
        npMessages.set(interaction.guildId!, interaction.channel.id);
      }
    } catch (err: any) {
      logger.error(`Error executing ${cmdName}:`, err?.stack || err?.message || err);
      const reply = interaction.deferred || interaction.replied
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);

      await reply({
        content: 'An error occurred while executing the command.',
        ephemeral: true,
      }).catch(() => {});
    }
  } else if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        logger.error(`Autocomplete error for ${interaction.commandName}:`, err);
        await interaction.respond([]).catch(() => {});
      }
    }
  } else if (interaction.isButton()) {
    await handleButton(interaction);
  } else {
    logger.debug(`Unhandled interaction type: ${interaction.type}`);
  }
});

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const queue = getQueue(guildId);

  switch (interaction.customId) {
    case 'pause': {
      if (queue.connection?.audioPlayer) {
        queue.connection.audioPlayer.pause();
        queue.isPaused = true;
      }
      break;
    }
    case 'resume': {
      if (queue.connection?.audioPlayer) {
        queue.connection.audioPlayer.unpause();
        queue.isPaused = false;
        queue.connection.startTime = Date.now();
      }
      break;
    }
    case 'next': {
      if (queue.connection?.audioPlayer) {
        queue.connection.audioPlayer.stop();
      }
      const next = skipTrack(guildId);
      if (next) {
        queue.seekOffset = 0;
        await playCurrent(guildId, interaction.channel as any);
      }
      break;
    }
    case 'prev': {
      if (queue.currentIndex > 0) {
        previousTrack(guildId);
        if (queue.connection?.audioPlayer) {
          queue.connection.audioPlayer.stop();
        }
        queue.seekOffset = 0;
        await playCurrent(guildId, interaction.channel as any);
      } else {
        queue.seekOffset = 0;
        if (queue.connection?.audioPlayer) {
          queue.connection.audioPlayer.stop();
        }
        await playCurrent(guildId, interaction.channel as any);
      }
      break;
    }
    case 'stop': {
      if (queue.connection?.audioPlayer) {
        queue.connection.audioPlayer.stop(true);
      }
      queue.items = [];
      queue.currentIndex = -1;
      queue.isPlaying = false;
      queue.isPaused = false;
      stopScrobble(guildId);
      stopNpTimer(guildId);
      await interaction.editReply({ embeds: [] as any, components: [] }).catch(() => {});
      return;
    }
    case 'fav': {
      const current = getCurrentTrack(guildId);
      if (current) {
        await embyClient.addFavorite(current.track.id);
      }
      break;
    }
    case 'loop': {
      const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
      const idx = modes.indexOf(queue.loopMode);
      queue.loopMode = modes[(idx + 1) % modes.length];
      break;
    }
  }

  await updateNowPlayingEmbed(guildId);
  await interaction.editReply({}).catch(() => {});
}

async function start() {
  try {
    await embyClient.authenticate();
    await discordClient.login(config.DISCORD_TOKEN);
  } catch (err) {
    logger.error('Failed to start bot:', err);
    process.exit(1);
  }
}

start();
