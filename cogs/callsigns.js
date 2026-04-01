const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

// -------------------------
// DB SETUP
// -------------------------
const db = new Database(path.join(__dirname, '../data/callsigns.db'));

db.prepare(`
    CREATE TABLE IF NOT EXISTS AuthorizedUsers (
        UserId TEXT PRIMARY KEY
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS GuildTeams (
        GuildId TEXT PRIMARY KEY,
        TeamName TEXT NOT NULL
    )
`).run();

// -------------------------
// CONFIG
// -------------------------
const API = `${process.env.API_BASE}/callsign`;
const HEADERS = {
    Authorization: `Bearer ${process.env.API_KEY}`
};

const BOT_OWNER = process.env.BOT_OWNER;

// -------------------------
// HELPERS
// -------------------------
function IsOwner(userId) {
    return userId === BOT_OWNER;
}

function IsAuthorized(userId) {
    if (IsOwner(userId)) return true;

    const row = db.prepare(
        `SELECT 1 FROM AuthorizedUsers WHERE UserId = ?`
    ).get(userId);

    return !!row;
}

function GetGuildTeam(guildId) {
    const row = db.prepare(
        `SELECT TeamName FROM GuildTeams WHERE GuildId = ?`
    ).get(guildId);

    return row?.TeamName || null;
}

function SetGuildTeam(guildId, team) {
    db.prepare(`
        INSERT INTO GuildTeams (GuildId, TeamName)
        VALUES (?, ?)
        ON CONFLICT(GuildId)
        DO UPDATE SET TeamName = excluded.TeamName
    `).run(guildId, team);
}

function RemoveGuildTeam(guildId) {
    db.prepare(
        `DELETE FROM GuildTeams WHERE GuildId = ?`
    ).run(guildId);
}

function AddAuthorizedUser(userId) {
    db.prepare(`
        INSERT OR IGNORE INTO AuthorizedUsers (UserId)
        VALUES (?)
    `).run(userId);
}

// -------------------------
// API HELPER
// -------------------------
async function ApiPost(route, data) {
    return axios.post(`${API}/${route}`, data, { headers: HEADERS });
}

// -------------------------
// TEAM COMMANDS
// -------------------------
const TeamCommands = [

    {
        data: new SlashCommandBuilder()
            .setName('requestcallsign')
            .setDescription('Get or create your callsign'),

        async execute(interaction) {
            const team = GetGuildTeam(interaction.guildId);

            if (!team) {
                return interaction.reply({ content: '❌ No team assigned.', ephemeral: true });
            }

            try {
                const res = await ApiPost('auto', {
                    platform: 'discord',
                    platformId: interaction.user.id,
                    teamName: team
                });

                if (!res.data.success) {
                    return interaction.reply('❌ Failed.');
                }

                return interaction.reply(`✅ Callsign: **${res.data.callsign}**`);

            } catch {
                return interaction.reply('❌ API error.');
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('deleteuser')
            .setDescription('Remove user callsign')
            .addUserOption(opt => opt.setName('user').setRequired(true)),

        async execute(interaction) {
            const team = GetGuildTeam(interaction.guildId);
            if (!team) return interaction.reply('❌ No team.');

            const target = interaction.options.getUser('user');

            try {
                await ApiPost('reset', {
                    platform: 'discord',
                    platformId: target.id
                });

                return interaction.reply(`✅ Removed ${target.tag}`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('adduser')
            .setDescription('Force assign callsign')
            .addUserOption(opt => opt.setName('user').setRequired(true))
            .addIntegerOption(opt => opt.setName('number').setRequired(true)),

        async execute(interaction) {
            const team = GetGuildTeam(interaction.guildId);
            if (!team) return interaction.reply('❌ No team.');

            const target = interaction.options.getUser('user');
            const number = interaction.options.getInteger('number');

            try {
                const res = await ApiPost('set', {
                    platform: 'discord',
                    platformId: target.id,
                    teamName: team,
                    number
                });

                return interaction.reply(`✅ ${target.tag} → ${res.data.callsign}`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    }
];

// -------------------------
// ADMIN COMMANDS
// -------------------------
const AdminCommands = [

    {
        data: new SlashCommandBuilder()
            .setName('addauthorizeduser')
            .setDescription('Add authorized user')
            .addUserOption(opt => opt.setName('user').setRequired(true)),

        async execute(interaction) {
            if (!IsOwner(interaction.user.id)) {
                return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
            }

            const user = interaction.options.getUser('user');

            AddAuthorizedUser(user.id);

            return interaction.reply(`✅ ${user.tag} authorized.`);
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('assignteam')
            .setDescription('Assign guild to team')
            .addStringOption(opt => opt.setName('team').setRequired(true))
            .addStringOption(opt => opt.setName('base').setRequired(true)),

        async execute(interaction) {
            if (!IsAuthorized(interaction.user.id)) {
                return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
            }

            const team = interaction.options.getString('team');
            const base = interaction.options.getString('base');

            SetGuildTeam(interaction.guildId, team);

            try {
                await ApiPost('create-team', {
                    name: team,
                    callsignBase: base
                });

                return interaction.reply(`✅ Assigned to **${team}**`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('unassignteam')
            .setDescription('Remove guild team'),

        async execute(interaction) {
            if (!IsAuthorized(interaction.user.id)) {
                return interaction.reply('❌ Not authorized.');
            }

            RemoveGuildTeam(interaction.guildId);

            return interaction.reply('✅ Removed.');
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('forcecallsign')
            .setDescription('Force assign callsign')
            .addUserOption(opt => opt.setName('user').setRequired(true))
            .addStringOption(opt => opt.setName('team').setRequired(true))
            .addIntegerOption(opt => opt.setName('number').setRequired(true)),

        async execute(interaction) {
            if (!IsAuthorized(interaction.user.id)) {
                return interaction.reply('❌ Not authorized.');
            }

            const user = interaction.options.getUser('user');
            const team = interaction.options.getString('team');
            const number = interaction.options.getInteger('number');

            try {
                const res = await ApiPost('set', {
                    platform: 'discord',
                    platformId: user.id,
                    teamName: team,
                    number
                });

                return interaction.reply(`✅ ${user.tag} → ${res.data.callsign}`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('forcedeleteuser')
            .setDescription('Remove user fully')
            .addUserOption(opt => opt.setName('user').setRequired(true)),

        async execute(interaction) {
            if (!IsAuthorized(interaction.user.id)) {
                return interaction.reply('❌ Not authorized.');
            }

            const user = interaction.options.getUser('user');

            try {
                await ApiPost('remove-user', {
                    platform: 'discord',
                    platformId: user.id
                });

                return interaction.reply(`✅ Removed ${user.tag}`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    }
];

// -------------------------
// EXPORT
// -------------------------
module.exports = {
    commands: [
        ...TeamCommands,
        ...AdminCommands
    ]
};