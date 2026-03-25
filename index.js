/*
Not_Lowest
A linking bot that is NOT optimized at all
*/

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
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
const commandsArray = [];

for (const file of fs.readdirSync('./commands')) {
    const cmd = require(`./commands/${file}`);
    client.commands.set(cmd.data.name, cmd);
    commandsArray.push(cmd.data.toJSON());
}

// -------------------------
// Load events
// -------------------------
for (const file of fs.readdirSync('./events')) {
    const event = require(`./events/${file}`);
    event(client);
}

// -------------------------
// Sync Function
// -------------------------
async function SyncEntitlements(member) {
    const userId = member.id;

    const entitlements = {};
    const mappings = GetAllMappings();

    entitlements["booster"] = !!member.premiumSince;

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
// Auto Sync
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
// Ready + DEPLOY COMMANDS
// -------------------------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('Deploying slash commands...');

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commandsArray }
        );

        console.log('Commands deployed instantly (guild).');

        /*
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandsArray }
        );
        */

    } catch (error) {
        console.error('Command deploy failed:', error);
    }
});

client.login(process.env.TOKEN);