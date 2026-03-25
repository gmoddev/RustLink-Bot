const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();

const axios = require('axios');
const { GetAllMappings } = require('./db/entitlements');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();

const fs = require('fs');

// -------------------------
// Load commands
// -------------------------
for (const file of fs.readdirSync('./src/commands')) {
    const cmd = require(`./commands/${file}`);
    client.commands.set(cmd.data.name, cmd);
}

// -------------------------
// Load events
// -------------------------
for (const file of fs.readdirSync('./src/events')) {
    const event = require(`./events/${file}`);
    event(client);
}

// -------------------------
// 🔥 CORE SYNC FUNCTION
// -------------------------
async function SyncEntitlements(member) {
    const userId = member.id;

    const entitlements = {};
    const mappings = GetAllMappings();

    // Booster
    entitlements["booster"] = !!member.premiumSince;

    // Initialize all mapped entitlements to false
    for (const mapping of mappings) {
        entitlements[mapping.Entitlement] = false;
    }

    // Apply roles
    for (const role of member.roles.cache.values()) {
        const match = mappings.find(m => m.RoleId === role.id);
        if (match) {
            entitlements[match.Entitlement] = true;
        }
    }

    try {
        await axios.post(
            `${process.env.API_BASE}/update-entitlements`,
            {
                discordId: userId,
                entitlements
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.API_KEY}`
                }
            }
        );
    } catch (err) {
        console.error('SyncEntitlements failed:', err?.response?.data || err.message);
    }
}

// -------------------------
// 🔥 AUTO SYNC ON JOIN
// -------------------------
client.on('guildMemberAdd', async (member) => {
    await SyncEntitlements(member);
});

// -------------------------
// Commands
// -------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction, client);
});

// -------------------------
// Ready (optional debug)
// -------------------------
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);