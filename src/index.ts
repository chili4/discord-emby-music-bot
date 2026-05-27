import { Events, REST, Routes, ButtonInteraction } from 'discord.js';
import { discordClient } from './client/discord.client';
import { embyClient } from './client/emby.client';
import { config } from './config';
import { logger } from './utils/logger';
import { getCommandData, registerCommands } from './commands';
import {
  getQueue, getCurrentTrack, skipTrack, previousTrack,
} from './services/queue.service';
import { playCurrent, stopAndClear } from './services/player.service';
import { updateNP } from './services/nowplaying.service';
import { simpleEmbed } from './utils/embed';

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

discordClient.on('debug', (msg) => {
  if (msg.includes('INTERACTION') || msg.includes('AUTOCOMPLETE') || msg.includes('DISPATCH')) {
    logger.debug(`[WS] ${msg.slice(0, 200)}`);
  }
});

discordClient.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${discordClient.user!.tag}`);
  await registerSlashCommands();
});

discordClient.on(Events.InteractionCreate, async (interaction) => {
  logger.debug(`🔄 Interaction: type=${interaction.type} cmd=${(interaction as any).commandName || 'N/A'} user=${interaction.user.tag}`);

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
    console.log(`[AUTOCOMPLETE] cmd=${interaction.commandName} user=${interaction.user.tag}`);
    const cmd = commands.get(interaction.commandName);
    if (cmd?.autocomplete) {
      try {
        await cmd.autocomplete(interaction);
        console.log(`[AUTOCOMPLETE] OK`);
      } catch (e: any) {
        console.error(`[AUTOCOMPLETE] Error: ${e.message}`);
        await interaction.respond([]).catch(() => {});
      }
    } else {
      console.warn(`[AUTOCOMPLETE] No handler for ${interaction.commandName}`);
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
      q.skipGuard = true;
      const n = skipTrack(g);
      if (n) { q.seekOffset = 0; await playCurrent(g, interaction.channel as any); }
      break;
    }
    case 'prev': {
      q.skipGuard = true;
      previousTrack(g);
      q.seekOffset = 0;
      await playCurrent(g, interaction.channel as any);
      break;
    }
    case 'rewind': {
      if (q.connection?.startTime) {
        q.seekOffset += Math.floor((Date.now() - q.connection.startTime) / 1000);
      }
      q.seekOffset = Math.max(0, q.seekOffset - 10);
      q.skipGuard = true;
      if (q.isPaused) {
        q.connection!.startTime = Date.now();
      } else {
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
      q.skipGuard = true;
      if (q.isPaused) {
        q.connection!.startTime = Date.now();
      } else {
        q.connection!.startTime = Date.now();
        await playCurrent(g, interaction.channel as any);
      }
      break;
    }
    case 'stop': {
      await stopAndClear(g);
      await interaction.editReply({ embeds: [], components: [] }).catch(() => {});
      return;
    }
    case 'fav': {
      const cur = getCurrentTrack(g);
      if (cur) {
        await embyClient.toggleFavorite(cur.track.id);
        const isFav = await embyClient.isFavorite(cur.track.id).catch(() => false);
        cur.track.isFavorite = isFav;
        await updateNP(g, isFav);
        await interaction.editReply({}).catch(() => {});
        return;
      }
      break;
    }
    case 'loop': {
      const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
      q.loopMode = modes[(modes.indexOf(q.loopMode) + 1) % 3];
      break;
    }
  }

  await updateNP(g);
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
