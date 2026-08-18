export interface CommandSuggestion {
  text: string;
  syntax: string;
  description: string;
  minVersion?: string;
  maxVersion?: string;
}

export interface AutocompleteItem {
  text: string;
  label: string;
  hint?: string;
  completion: string;
  type?: 'command' | 'player' | 'selector' | 'item' | 'enum';
  avatarUrl?: string;
}

export const TARGET_SELECTORS = [
  { text: '@p', label: '@p', description: 'Nearest player' },
  { text: '@r', label: '@r', description: 'Random player' },
  { text: '@a', label: '@a', description: 'All players' },
  { text: '@e', label: '@e', description: 'All entities' },
  { text: '@s', label: '@s', description: 'Self / executor' },
];

export const COMMON_ITEMS = [
  'minecraft:diamond',
  'minecraft:diamond_sword',
  'minecraft:diamond_pickaxe',
  'minecraft:netherite_ingot',
  'minecraft:netherite_sword',
  'minecraft:netherite_pickaxe',
  'minecraft:iron_ingot',
  'minecraft:gold_ingot',
  'minecraft:emerald',
  'minecraft:apple',
  'minecraft:golden_apple',
  'minecraft:enchanted_golden_apple',
  'minecraft:bread',
  'minecraft:cooked_beef',
  'minecraft:torch',
  'minecraft:villager_spawn_egg',
  'minecraft:zombie_spawn_egg',
  'minecraft:skeleton_spawn_egg',
  'minecraft:creeper_spawn_egg',
  'minecraft:ender_pearl',
  'minecraft:elytra',
  'minecraft:totem_of_undying',
  'minecraft:experience_bottle',
  'minecraft:oak_log',
  'minecraft:stone',
  'minecraft:cobblestone',
  'minecraft:dirt',
  'minecraft:grass_block',
  'minecraft:white_bed',
  'minecraft:red_bed',
  'minecraft:bow',
  'minecraft:arrow',
];

export const COMMON_GAMEMODES = [
  'survival',
  'creative',
  'adventure',
  'spectator',
];

export const COMMON_DIFFICULTIES = [
  'peaceful',
  'easy',
  'normal',
  'hard',
];

export const MINECRAFT_COMMANDS: CommandSuggestion[] = [
  {
    text: 'give',
    syntax: 'give <player> <item> [count]',
    description: 'Gives an item to one or more players',
  },
  {
    text: 'gamemode',
    syntax: 'gamemode <mode> [player]',
    description: 'Sets a player\'s game mode (survival, creative, adventure, spectator)',
  },
  {
    text: 'teleport',
    syntax: 'teleport <destination> or teleport <targets> <location>',
    description: 'Teleports entities (players, mobs, etc.)',
  },
  {
    text: 'tp',
    syntax: 'tp <destination> or tp <targets> <location>',
    description: 'Teleports entities (alias for teleport)',
  },
  {
    text: 'op',
    syntax: 'op <player>',
    description: 'Grants operator status to a player',
  },
  {
    text: 'deop',
    syntax: 'deop <player>',
    description: 'Revokes operator status from a player',
  },
  {
    text: 'kick',
    syntax: 'kick <player> [reason]',
    description: 'Disconnects a player from the server',
  },
  {
    text: 'ban',
    syntax: 'ban <player> [reason]',
    description: 'Adds a player to the server banlist',
  },
  {
    text: 'pardon',
    syntax: 'pardon <player>',
    description: 'Removes a player from the server banlist',
  },
  {
    text: 'ban-ip',
    syntax: 'ban-ip <player|ip> [reason]',
    description: 'Adds an IP address to the server banlist',
  },
  {
    text: 'pardon-ip',
    syntax: 'pardon-ip <ip>',
    description: 'Removes an IP address from the server banlist',
  },
  {
    text: 'whitelist',
    syntax: 'whitelist <add|remove|list|on|off|reload>',
    description: 'Manages the server whitelist',
  },
  {
    text: 'time',
    syntax: 'time <set|add|query> <day|night|noon|midnight|value>',
    description: 'Changes or queries the world time',
  },
  {
    text: 'weather',
    syntax: 'weather <clear|rain|thunder> [duration]',
    description: 'Sets the weather condition and duration',
  },
  {
    text: 'difficulty',
    syntax: 'difficulty <peaceful|easy|normal|hard>',
    description: 'Sets the gameplay difficulty level',
  },
  {
    text: 'say',
    syntax: 'say <message>',
    description: 'Broadcasts a message in chat to all players',
  },
  {
    text: 'msg',
    syntax: 'msg <player> <message>',
    description: 'Sends a private message to one or more players',
  },
  {
    text: 'tell',
    syntax: 'tell <player> <message>',
    description: 'Sends a private message to one or more players',
  },
  {
    text: 'w',
    syntax: 'w <player> <message>',
    description: 'Sends a private message to one or more players',
  },
  {
    text: 'kill',
    syntax: 'kill [targets]',
    description: 'Kills entities (players, mobs, items)',
  },
  {
    text: 'experience',
    syntax: 'experience <add|set|query> <targets> <amount> [points|levels]',
    description: 'Adds, removes, or queries player experience',
    minVersion: '1.13',
  },
  {
    text: 'xp',
    syntax: 'xp <add|set|query> <targets> <amount> [points|levels]',
    description: 'Manages player experience (alias for experience)',
  },
  {
    text: 'clear',
    syntax: 'clear [targets] [item] [maxCount]',
    description: 'Clears items from player inventory',
  },
  {
    text: 'effect',
    syntax: 'effect <give|clear> <targets> [effect] [seconds] [amplifier] [hideParticles]',
    description: 'Applies or clears status effects',
  },
  {
    text: 'enchant',
    syntax: 'enchant <targets> <enchantment> [level]',
    description: 'Adds an enchantment to a player\'s selected item',
  },
  {
    text: 'summon',
    syntax: 'summon <entity> [pos] [nbt]',
    description: 'Summons an entity into the world',
  },
  {
    text: 'setblock',
    syntax: 'setblock <pos> <block> [destroy|keep|replace]',
    description: 'Changes a block at specific coordinates',
  },
  {
    text: 'fill',
    syntax: 'fill <from> <to> <block> [replace|destroy|keep|hollow|outline]',
    description: 'Fills all or parts of a region with a specific block',
  },
  {
    text: 'clone',
    syntax: 'clone <begin> <end> <destination> [maskMode] [cloneMode]',
    description: 'Clones blocks from one region to another',
  },
  {
    text: 'gamerule',
    syntax: 'gamerule <rule> [value]',
    description: 'Sets or queries a game rule value',
  },
  {
    text: 'seed',
    syntax: 'seed',
    description: 'Displays the world seed',
  },
  {
    text: 'list',
    syntax: 'list [uuids]',
    description: 'Lists players currently connected to the server',
  },
  {
    text: 'save-all',
    syntax: 'save-all [flush]',
    description: 'Forces the server to save world state to disk',
  },
  {
    text: 'save-on',
    syntax: 'save-on',
    description: 'Enables automatic world saving',
  },
  {
    text: 'save-off',
    syntax: 'save-off',
    description: 'Disables automatic world saving',
  },
  {
    text: 'stop',
    syntax: 'stop',
    description: 'Saves the world and safely stops the server',
  },
  {
    text: 'reload',
    syntax: 'reload',
    description: 'Reloads data packs, advancements, and functions',
  },
  {
    text: 'datapack',
    syntax: 'datapack <enable|disable|list>',
    description: 'Controls loaded data packs',
    minVersion: '1.13',
  },
  {
    text: 'worldborder',
    syntax: 'worldborder <set|add|center|damage|warning|get>',
    description: 'Controls the world border boundary',
    minVersion: '1.8',
  },
  {
    text: 'tag',
    syntax: 'tag <targets> <add|remove|list> <name>',
    description: 'Controls tags on entities',
    minVersion: '1.13',
  },
  {
    text: 'team',
    syntax: 'team <add|remove|join|leave|empty|list|modify>',
    description: 'Controls scoreboard teams',
    minVersion: '1.13',
  },
  {
    text: 'scoreboard',
    syntax: 'scoreboard <objectives|players>',
    description: 'Manages scoreboard objectives and player scores',
  },
  {
    text: 'attribute',
    syntax: 'attribute <target> <attribute> <get|base|modifier>',
    description: 'Modifies entity attributes',
    minVersion: '1.16',
  },
  {
    text: 'locate',
    syntax: 'locate <structure|poi|biome> <id>',
    description: 'Locates closest structure, biome, or point of interest',
    minVersion: '1.11',
  },
  {
    text: 'item',
    syntax: 'item <replace|modify> ...',
    description: 'Modifies item inventories and block entities',
    minVersion: '1.17',
  },
  {
    text: 'place',
    syntax: 'place <feature|jigsaw|structure|template> ...',
    description: 'Places configured features or structures into the world',
    minVersion: '1.19',
  },
  {
    text: 'tick',
    syntax: 'tick <rate|freeze|step|unfreeze|sprint>',
    description: 'Controls the server tick rate and freezes/steps physics',
    minVersion: '1.20.3',
  },
  {
    text: 'damage',
    syntax: 'damage <target> <amount> [damageType] [at <location>|by <entity>]',
    description: 'Applies specific damage to entities',
    minVersion: '1.19.4',
  },
];

/**
 * Compare two semantic version strings (e.g. "1.12.2" vs "1.20.1")
 */
export function isVersionAtLeast(current: string, required: string): boolean {
  if (!current || current === '?' || current === 'latest' || current.startsWith('26.')) return true; // Snapshot/dev assumes latest features
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const curParts = parse(current);
  const reqParts = parse(required);

  for (let i = 0; i < Math.max(curParts.length, reqParts.length); i++) {
    const c = curParts[i] || 0;
    const r = reqParts[i] || 0;
    if (c > r) return true;
    if (c < r) return false;
  }
  return true;
}

/**
 * Compute suggestions based on input command and player list + mc version
 */
export function getCommandSuggestions(
  input: string,
  mcVersion: string,
  players: Array<{ name: string; isOnline?: boolean; isOp?: boolean }> = []
): AutocompleteItem[] {
  const clean = input.startsWith('/') ? input.substring(1) : input;
  const parts = clean.split(' ');
  const currentToken = parts[parts.length - 1];

  // 1. If typing the root command (e.g. "gi", "time", "gam")
  if (parts.length <= 1) {
    const query = clean.toLowerCase();
    return MINECRAFT_COMMANDS
      .filter((cmd) => {
        if (cmd.minVersion && !isVersionAtLeast(mcVersion, cmd.minVersion)) return false;
        return cmd.text.toLowerCase().startsWith(query);
      })
      .slice(0, 10)
      .map((cmd) => ({
        text: cmd.text,
        label: cmd.text,
        hint: cmd.syntax,
        completion: `${cmd.text} `,
        type: 'command',
      }));
  }

  const rootCommand = parts[0].toLowerCase();
  const tokenIndex = parts.length - 1; // 1 for first arg, 2 for second arg, etc.
  const tokenQuery = currentToken.toLowerCase();

  // Create list of player completions (ONLY currently online players with avatars, then selectors)
  const onlinePlayers = players.filter((p) => p.isOnline);
  const playerItems: AutocompleteItem[] = [
    ...onlinePlayers.map((p) => ({
      text: p.name,
      label: p.name,
      hint: 'Online Player',
      completion: `${parts.slice(0, tokenIndex).join(' ')} ${p.name} `,
      type: 'player' as const,
      avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(p.name)}/24`,
    })),
    ...TARGET_SELECTORS.map((s) => ({
      text: s.text,
      label: s.label,
      hint: s.description,
      completion: `${parts.slice(0, tokenIndex).join(' ')} ${s.text} `,
      type: 'selector' as const,
    })),
  ];

  // 2. Suggestions for argument 1
  if (tokenIndex === 1) {
    // Player target commands: give, tp, teleport, op, deop, kick, ban, pardon, kill, msg, tell
    if (['give', 'tp', 'teleport', 'op', 'deop', 'kick', 'ban', 'pardon', 'msg', 'tell', 'w', 'clear'].includes(rootCommand)) {
      return playerItems.filter((p) => p.text.toLowerCase().startsWith(tokenQuery));
    }

    if (rootCommand === 'gamemode') {
      return COMMON_GAMEMODES
        .filter((g) => g.startsWith(tokenQuery))
        .map((g) => ({
          text: g,
          label: g,
          hint: `Switch gamemode to ${g}`,
          completion: `${parts[0]} ${g} `,
          type: 'enum',
        }));
    }

    if (rootCommand === 'difficulty') {
      return COMMON_DIFFICULTIES
        .filter((d) => d.startsWith(tokenQuery))
        .map((d) => ({
          text: d,
          label: d,
          hint: `Set difficulty to ${d}`,
          completion: `${parts[0]} ${d}`,
          type: 'enum',
        }));
    }

    if (rootCommand === 'time') {
      return ['set', 'add', 'query']
        .filter((t) => t.startsWith(tokenQuery))
        .map((t) => ({
          text: t,
          label: t,
          hint: `Time action: ${t}`,
          completion: `${parts[0]} ${t} `,
          type: 'enum',
        }));
    }

    if (rootCommand === 'weather') {
      return ['clear', 'rain', 'thunder']
        .filter((w) => w.startsWith(tokenQuery))
        .map((w) => ({
          text: w,
          label: w,
          hint: `Set weather: ${w}`,
          completion: `${parts[0]} ${w}`,
          type: 'enum',
        }));
    }

    if (rootCommand === 'whitelist') {
      return ['add', 'remove', 'list', 'on', 'off', 'reload']
        .filter((w) => w.startsWith(tokenQuery))
        .map((w) => ({
          text: w,
          label: w,
          hint: `Whitelist command: ${w}`,
          completion: `${parts[0]} ${w} `,
          type: 'enum',
        }));
    }
  }

  // 3. Suggestions for argument 2
  if (tokenIndex === 2) {
    if (rootCommand === 'give') {
      return COMMON_ITEMS
        .filter((item) => item.toLowerCase().includes(tokenQuery) || item.replace('minecraft:', '').startsWith(tokenQuery))
        .slice(0, 10)
        .map((item) => ({
          text: item,
          label: item.replace('minecraft:', ''),
          hint: item,
          completion: `${parts.slice(0, tokenIndex).join(' ')} ${item} `,
          type: 'item',
        }));
    }

    if (rootCommand === 'gamemode') {
      return playerItems.filter((p) => p.text.toLowerCase().startsWith(tokenQuery));
    }

    if (rootCommand === 'time' && parts[1] === 'set') {
      return ['day', 'night', 'noon', 'midnight', '1000', '6000', '13000', '18000']
        .filter((t) => t.startsWith(tokenQuery))
        .map((t) => ({
          text: t,
          label: t,
          hint: `Set time to ${t}`,
          completion: `${parts.slice(0, tokenIndex).join(' ')} ${t}`,
          type: 'enum',
        }));
    }

    if (rootCommand === 'whitelist' && (parts[1] === 'add' || parts[1] === 'remove')) {
      return playerItems.filter((p) => p.text.toLowerCase().startsWith(tokenQuery));
    }
  }

  // 4. Suggestions for argument 3 (counts, etc.)
  if (tokenIndex === 3) {
    if (rootCommand === 'give') {
      return ['1', '16', '32', '64']
        .filter((c) => c.startsWith(tokenQuery))
        .map((c) => ({
          text: c,
          label: `${c} items`,
          hint: `Give count of ${c}`,
          completion: `${parts.slice(0, tokenIndex).join(' ')} ${c}`,
          type: 'enum',
        }));
    }
  }

  return [];
}
