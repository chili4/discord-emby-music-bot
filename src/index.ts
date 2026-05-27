import { Events, REST, Routes } from 'discord.js';
import { discordClient } from './client/discord.client';
import { embyClient } from './client/emby.client';
import { config } from './config';
import { logger } from './utils/logger';
import { getCommandData, registerCommands } from './commands';

const commands = registerCommands();

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
  await registerSlashCommands();
});

discordClient.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err: any) {
      logger.error(`Error executing ${interaction.commandName}:`, err.message);
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
  }
});

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
