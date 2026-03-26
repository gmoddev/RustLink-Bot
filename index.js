/*
Not_Lowest
Discord bot with cog-style module loading
*/

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GetAllMappings } = require('./db/entitlements');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();

// -------------------------
// Cog Loader
// Cogs live in ./cogs/
// Each cog exports:
//   { commands: [], events: [] }
//
//   commands: array of { data, execute }
//   events:   array of { name, once, execute }
// -------------------------
const commandsArray = [];

const cogsDir = path.join(__dirname, 'cogs');

for (const file of fs.readdirSync(cogsDir).filter(f => f.endsWith('.js'))) {
    const cogPath = path.join(cogsDir, file);
    const cog = require(cogPath);

    // Register commands
    if (Array.isArray(cog.commands)) {
        for (const cmd of cog.commands) {
            client.commands.set(cmd.data.name, cmd);
            commandsArray.push(cmd.data.toJSON());
            console.log(`[COG] Loaded command: ${cmd.data.name} (${file})`);
        }
    }

    // Register events
    if (Array.isArray(cog.events)) {
        for (const event of cog.events) {
            const handler = (...args) => event.execute(...args, client);

            if (event.once) {
                client.once(event.name, handler);
            } else {
                client.on(event.name, handler);
            }

            console.log(`[COG] Loaded event: ${event.name} (${file})`);
        }
    }
}

// -------------------------
// Sync Function (shared util)
// -------------------------
async function SyncEntitlements(member) {
    const userId = member.id;
    const entitlements = {};
    const mappings = GetAllMappings();

    entitlements['booster'] = !!member.premiumSince;

    for (const mapping of mappings) {
        entitlements[mapping.Entitlement] = false;
    }

    for (const role of member.roles.cache.values()) {
        const match = mappings.find(m => m.RoleId === role.id);
        if (match) {
            entitlements[match.Entitlement] = true;
        }
    }

    try {
        await axios.post(
            `${process.env.API_BASE}/update-entitlements`,
            { discordId: userId, entitlements },
            { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
        );
    } catch (err) {
        console.error('SyncEntitlements failed:', err?.response?.data || err.message);
    }
}

// Expose SyncEntitlements globally so cogs can import it
client.SyncEntitlements = SyncEntitlements;

// -------------------------
// Core: Interaction Handler
// -------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, client);
    } catch (err) {
        console.error(`Command error [${interaction.commandName}]:`, err);

        const msg = { content: '❌ An error occurred.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(msg);
        } else {
            await interaction.reply(msg);
        }
    }
});

// -------------------------
// Core: Ready + Deploy
// -------------------------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log(`Deploying ${commandsArray.length} slash command(s)...`);

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commandsArray }
        );

        console.log('Commands deployed.');
    } catch (error) {
        console.error('Command deploy failed:', error);
    }
});

client.login(process.env.TOKEN);