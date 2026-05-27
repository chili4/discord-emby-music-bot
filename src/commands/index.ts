import { Collection } from 'discord.js';

import * as play from './play.command';
import * as pause from './pause.command';
import * as skip from './skip.command';
import * as previous from './previous.command';
import * as stop from './stop.command';
import * as queue from './queue.command';
import * as remove from './remove.command';
import * as jump from './jump.command';
import * as shuffle from './shuffle.command';
import * as volume from './volume.command';
import * as summon from './summon.command';
import * as disconnect from './disconnect.command';
import * as status from './status.command';
import * as nowplaying from './nowplaying.command';
import * as search from './search.command';
import * as random from './random.command';
import * as lyrics from './lyrics.command';
import * as help from './help.command';
import * as clear from './clear.command';

const commands = [
  play, pause, skip, previous, stop, clear,
  queue, remove, jump, shuffle,
  volume, summon, disconnect,
  status, nowplaying, search, random, lyrics, help,
] as const;

export function registerCommands(): Collection<string, { data: any; execute: any; autocomplete?: any }> {
  const collection = new Collection<string, { data: any; execute: any; autocomplete?: any }>();

  for (const cmd of commands) {
    collection.set(cmd.data.name, {
      data: cmd.data.toJSON ? cmd.data.toJSON() : cmd.data,
      execute: cmd.execute,
      autocomplete: (cmd as any).autocomplete,
    });
  }

  return collection;
}

export function getCommandData(): any[] {
  return commands.map(c => c.data.toJSON ? c.data.toJSON() : c.data);
}

export { commands };
