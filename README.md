# Discord Emby Music Bot

Discord music bot that plays audio directly from your [Emby](https://emby.media) media server through the official API. Audio is transcoded to OPUS via FFmpeg and streamed to Discord voice channels.

## Features

- **22 slash commands** — play, pause, resume, skip, previous, stop, clear, queue, remove, jump, shuffle, volume, seek, summon, disconnect, nowplaying, search, random, lyrics, fav, playlist, status, help
- **Autocomplete** — search your Emby library by song, album, artist, or playlist name (with 350ms debounce)
- **Interactive buttons** — Prev, Pause/Resume, Stop, Next, -30s, Loop (Off/All/One), +30s, Fav, seekbar (0–100% in 5% steps)
- **Queue pagination** — ◀ ▶ buttons to browse the queue by pages
- **Loop modes** — no loop, loop all, loop one
- **Seek** — rewind/forward via buttons, `/seek` command, or interactive seekbar (uses FFmpeg `-ss` + HTTP Range)
- **Favorites** — mark/unmark tracks with the ❤️ button, browse favorites via `playlist play favorites`
- **Playlist management** — create, add, remove, view, delete, and play Emby playlists with sort options (normal, random, A-Z, newest)
- **Next track preview** — NP embed shows "▶️ Up next" with the next track name
- **Volume control** — 0–150 scale with logarithmic mapping
- **Scrobbling** — playback progress reported to Emby every 5 seconds
- **Now Playing display** — track info, progress bar, album art, real-time position counter (1s update)
- **Lyrics** — fetches from lrclib.net with fallback to lyrics.ovh
- **Session refresh** — Emby token auto-refreshes every 4 hours
- **Collision-safe** — `playerGeneration` guard prevents zombie listeners, `skipGuard`/`processingEnd` flags prevent double-skip, old FFmpeg synchronization via kill+await

## Requirements

- Node.js 22+ (or Docker)
- FFmpeg (with libopus support)
- An Emby server (tested with 4.9.x) accessible via HTTP
- A Discord bot application with:
  - `MESSAGE CONTENT INTENT` enabled
  - `SERVER MEMBERS INTENT` enabled
  - `applications.commands` scope
  - Invited with `bot` + `applications.commands` OAuth scopes

### Discord Bot Setup

1. Go to https://discord.com/developers/applications
2. Create a new application, then go to the **Bot** section
3. Click **Reset Token** and copy the token
4. Enable **Message Content Intent** and **Server Members Intent**
5. Go to **OAuth2 > URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Connect`, `Speak`, `Read Messages/View Channels`, `Send Messages`, `Embed Links`, `Use External Emojis`
6. Use the generated URL to invite the bot to your server

## Configuration

Clone the repository and copy the example environment file:

```bash
git clone https://github.com/chili4/discord-emby-music-bot.git
cd discord-emby-music-bot
cp .env.example .env
```

Edit `.env`:

```
# Discord bot token (required)
DISCORD_TOKEN=your_discord_bot_token_here

# Emby server (required)
EMBY_URL=http://localhost:8096
EMBY_USERNAME=Emby-bot
EMBY_PASSWORD=your_emby_password

# Public URL for album art display in Discord (optional but recommended)
# Set to your Emby domain if EMBY_URL points to an internal Docker IP
EMBY_PUBLIC_URL=https://your-public-domain.com

# Log level: error, warn, info, debug (default: info)
LOG_LEVEL=info

# Guild ID for instant command registration (optional)
# If unset, commands are registered globally (may take up to 1 hour to update)
# GUILD_ID=your_server_id
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_TOKEN` | Yes | — | Discord bot token from the Developer Portal |
| `EMBY_URL` | Yes | `http://localhost:8096` | Emby server URL (internal Docker network or localhost) |
| `EMBY_USERNAME` | Yes | — | Emby user account for the bot |
| `EMBY_PASSWORD` | Yes | — | Emby user password |
| `EMBY_PUBLIC_URL` | No | — | Public HTTPS URL for album thumbnails (set if EMBY_URL is internal) |
| `GUILD_ID` | No | — | Discord server ID for instant command registration (dev only) |
| `LOG_LEVEL` | No | `info` | Log verbosity: `error`, `warn`, `info`, `debug` |

## Deployment

### Docker (recommended)

```bash
docker compose up -d --build
```

The `docker-compose.yml` uses `network_mode: host` — required for Discord voice UDP connectivity.

### Manual (Node.js)

```bash
npm install
npm run build
npm start
```

For development with hot reload:

```bash
npm run dev
```

## Commands

| Command | Description |
|---|---|
| `/play <name> [type] [next] [now]` | Search and play music from your Emby library |
| `/pause` | Pause playback |
| `/resume` | Resume playback |
| `/skip` | Skip to next track |
| `/previous` | Go back to previous track |
| `/stop` | Stop playback and clear the queue |
| `/clear` | Clear the queue without stopping |
| `/queue [page]` | Show the current queue (paginated with ◀ ▶ buttons) |
| `/remove <position>` | Remove a track from the queue (skips to next if removing current) |
| `/jump <position>` | Jump to a specific track in the queue |
| `/shuffle` | Randomize the remaining queue (preserves current track) |
| `/volume <0-150>` | Set playback volume |
| `/seek <seconds>` | Seek to a specific position in the current track |
| `/summon` | Make the bot join your voice channel |
| `/disconnect` | Disconnect the bot from voice and clean up memory |
| `/nowplaying` | Show the currently playing track |
| `/search <query>` | Search the Emby library |
| `/random [count]` | Play random tracks |
| `/lyrics` | Show lyrics for the current track |
| `/fav` | Toggle favorite on current track |
| `/playlist <create\|add\|remove\|list\|view\|play\|delete>` | Full playlist management |
| `/status` | Show bot status |
| `/help` | Show command reference |

### Play Options

- **`name` autocomplete** — start typing a song, album, or artist name; 350ms debounce prevents request storms
- **`type` filter** — restrict search to Audio, AudioAlbum, Playlist, or Artist
- **`next: true`** — add the track to play immediately after the current one
- **`now: true`** — replace upcoming tracks and play this one right now (keeps current track)

### Playlist Subcommands

| Subcommand | Description |
|---|---|
| `playlist create <name>` | Create a new empty playlist |
| `playlist add <name> <query>` | Search and add a track to an existing playlist |
| `playlist remove <name> <position>` | Remove a track by its position in the playlist |
| `playlist list` | List all your playlists |
| `playlist view <name>` | View tracks in a playlist |
| `playlist play <name> [sort]` | Play a playlist (supports `favorites` as a special name) |
| `playlist delete <name>` | Delete a playlist |

The `play` subcommand accepts a `sort` option: `normal` (default), `random` (Fisher-Yates shuffle), `A-Z`, or `newest`.

### Interactive Buttons

Every Now Playing message shows three rows of controls:

| Button | Action |
|---|---|
| ⏮️ Prev | Go back to previous track |
| ⏸️ / ▶️ | Pause / Resume |
| ⏹️ Stop | Stop playback and clear queue |
| ⏭️ Next | Skip to next track |
| ⏪ -30s | Rewind 30 seconds |
| ➡️ / 🔁 / 🔂 Loop | Toggle loop: Off → All → One |
| ⏩ +30s | Forward 30 seconds |
| ❤️ / 🤍 Fav | Toggle favorite status |
| Seekbar (0–100%) | Jump to any position in the track (5% steps) |

## Technical Architecture

```
Discord.js (discord.js 14 + @discordjs/voice)
    ↕
AudioPlayer (OPUS decode → Discord voice gateway)
    ↕
FFmpeg (HTTP stream → libopus encode → pipe)
    ↕
Emby API (audio streaming + metadata)
```

### Audio Pipeline

1. User runs `/play` → bot searches Emby via REST API
2. Bot spawns FFmpeg: `-user_agent VLC/3.0.20 -headers X-Emby-Token:... -ss <seek> -i <url> -acodec libopus -f opus pipe:1`
3. FFmpeg streams the audio file over HTTP (Emby's `/Audio/{id}/stream?Static=true`) and transcodes to OPUS
4. `@discordjs/voice` creates an `AudioResource` from FFmpeg's stdout pipe
5. The `AudioPlayer` sends Opus packets to Discord's voice gateway via UDP

### Key Design Decisions

- **Static streaming** (`Static=true`) — Emby serves the raw file without remuxing; seeking uses FFmpeg's `-ss` with Emby's HTTP Range support
- **No `-re` flag** — FFmpeg reads as fast as possible. Timers start only when `AudioPlayerStatus.Playing` fires (after ~3s buffer fill), preventing premature position tracking and distortion
- **Dual time tracking** — `startTime` = when `playCurrent` is called (for pause offset calculation), `playingStartTime` = when audio actually starts playing
- **Old FFmpeg synchronization** — before spawning a new FFmpeg, the old one is killed and awaited. This ensures the old resource's internal `end` listener fires while the player is Idle, not while Playing
- **`playerGeneration` guard** — each `playCurrent` increments `playerGeneration`. Idle handler discards events where `q.playerGeneration === 0` or `expectedGen !== currentGen`, preventing zombie listeners from previous players
- **`skipGuard` / `processingEnd` flags** — prevent double-processing from button clicks and reentrant Idle events
- **Autocomplete debounce** — 350ms timer clears on each keystroke; only the last keystroke within the window triggers an Emby API call

## Project Structure

```
├── src/
│   ├── client/
│   │   ├── discord.client.ts    # Discord.js client singleton
│   │   └── emby.client.ts       # Emby REST API client + auto-refresh timer
│   ├── commands/
│   │   ├── index.ts             # Command registry + button/select-menu handlers
│   │   ├── play.command.ts      # /play — search + playback + reconnect
│   │   ├── playlist.command.ts  # /playlist — full playlist CRUD
│   │   └── ...                  # All other commands
│   ├── config.ts                # Environment variable validation (zod)
│   ├── index.ts                 # Entry point — login, command registration
│   ├── models/
│   │   └── types.ts             # TypeScript interfaces
│   ├── services/
│   │   ├── player.service.ts    # FFmpeg spawn, AudioPlayer, voice connection
│   │   ├── queue.service.ts     # Queue state, skip/prev/jump/shuffle
│   │   ├── nowplaying.service.ts # NP message send/update/disable (1s timer)
│   │   ├── search.service.ts    # Emby search + debounced autocomplete
│   │   ├── scrobble.service.ts  # Playback progress reporting
│   │   └── lyrics.service.ts    # Lyrics (lrclib.net → lyrics.ovh fallback)
│   └── utils/
│       ├── embed.ts             # Discord embed builders + button rows + seekbar
│       ├── logger.ts            # Structured logger
│       └── time.ts              # tick-to-seconds conversion
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── tsconfig.json
└── package.json
```

## Troubleshooting

### FFmpeg exit code 255

**Expected behavior during skips:** when skipping, the old FFmpeg is killed intentionally. Exit code 255 is logged at `debug` level and not counted as an error.

**During natural playback:** FFmpeg exits 255 when the pipe closes after all data is consumed. The Idle handler advances to the next track or ends the queue normally.

### Commands not appearing

Global command registration can take up to an hour to propagate. Set `GUILD_ID` in `.env` for instant guild-only command updates.

### Discord cannot see album art

Set `EMBY_PUBLIC_URL` to a public HTTPS domain pointing to your Emby server. Discord blocks HTTP images. The bot embeds the URL with the API token as a query parameter.

### Voice connection drops

The bot uses `network_mode: host` in Docker to avoid Discord voice UDP issues. If running outside Docker, ensure UDP ports are not blocked.

### Timer starts before audio plays

Timers now start only when `AudioPlayerStatus.Playing` fires (after ~3 seconds), ensuring the position counter and scrobble are accurate from the moment audio begins.

## License

MIT