const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

// -------------------------
// DB SETUP (same pattern)
// -------------------------
const db = new Database(path.join(__dirname, '../data/timelog.db'));

db.prepare(`
    CREATE TABLE IF NOT EXISTS AuthorizedUsers (
        UserId TEXT PRIMARY KEY
    )
`).run();

// -------------------------
// CONFIG
// -------------------------
const API = `${process.env.API_BASE}/timelog`;
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

function AddAuthorizedUser(userId) {
    db.prepare(`
        INSERT OR IGNORE INTO AuthorizedUsers (UserId)
        VALUES (?)
    `).run(userId);
}

// -------------------------
// API HELPERS
// -------------------------
async function ApiPost(route, data, query = '') {
    return axios.post(`${API}/${route}${query}`, data, { headers: HEADERS });
}

async function ApiGet(route, query = '') {
    return axios.get(`${API}/${route}${query}`, { headers: HEADERS });
}

// -------------------------
// TIMELOG COMMANDS
// -------------------------
const TimeLogCommands = [

    // -------------------------
    // /join
    // -------------------------
    {
        data: new SlashCommandBuilder()
            .setName('join')
            .setDescription('Start your session'),

        async execute(interaction) {
            try {
                await ApiPost('join', {
                    ID: interaction.user.id,
                    Platform: 'discord'
                });

                return interaction.reply('✅ Session started.');

            } catch {
                return interaction.reply('❌ Failed to start session.');
            }
        }
    },

    // -------------------------
    // /leave
    // -------------------------
    {
        data: new SlashCommandBuilder()
            .setName('leave')
            .setDescription('End your session'),

        async execute(interaction) {
            try {
                await ApiPost('leave', {
                    ID: interaction.user.id,
                    Platform: 'discord'
                });

                return interaction.reply('✅ Session ended.');

            } catch {
                return interaction.reply('❌ Failed to end session.');
            }
        }
    },

    // -------------------------
    // /getsessions
    // -------------------------
    {
        data: new SlashCommandBuilder()
            .setName('getsessions')
            .setDescription('View user sessions')
            .addUserOption(opt => opt.setName('user').setRequired(true))
            .addIntegerOption(opt => opt.setName('page').setRequired(false))
            .addIntegerOption(opt => opt.setName('limit').setRequired(false)),

        async execute(interaction) {
            const user = interaction.options.getUser('user');
            const page = interaction.options.getInteger('page') || 1;
            const limit = interaction.options.getInteger('limit') || 10;

            try {
                const res = await ApiPost(
                    'getsessions',
                    {
                        ID: user.id,
                        Platform: 'discord'
                    },
                    `?page=${page}&limit=${limit}`
                );

                const sessions = res.data.data[0]?.sessions || [];

                if (!sessions.length) {
                    return interaction.reply('❌ No sessions found.');
                }

                const formatted = sessions
                    .slice(0, 10)
                    .map(s => {
                        const dur = s.duration
                            ? `${Math.floor(s.duration / 60000)}m`
                            : 'active';

                        return `• <t:${Math.floor(s.jointime / 1000)}:f> → ${dur}`;
                    })
                    .join('\n');

                return interaction.reply(`📊 Sessions:\n${formatted}`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    },

    // -------------------------
    // /addsession (ADMIN)
    // -------------------------
    {
        data: new SlashCommandBuilder()
            .setName('addsession')
            .setDescription('Manually add session')
            .addUserOption(opt => opt.setName('user').setRequired(true))
            .addIntegerOption(opt => opt.setName('join').setDescription('Join timestamp').setRequired(true))
            .addIntegerOption(opt => opt.setName('leave').setDescription('Leave timestamp').setRequired(true)),

        async execute(interaction) {
            if (!IsAuthorized(interaction.user.id)) {
                return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
            }

            const user = interaction.options.getUser('user');
            const join = interaction.options.getInteger('join');
            const leave = interaction.options.getInteger('leave');

            try {
                await ApiPost('addsession', {
                    ID: user.id,
                    Platform: 'discord',
                    JoinTime: join,
                    LeaveTime: leave
                });

                return interaction.reply(`✅ Session added for ${user.tag}`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    },

    // -------------------------
    // /getallsessions (ADMIN)
    // -------------------------
    {
        data: new SlashCommandBuilder()
            .setName('getallsessions')
            .setDescription('Get all sessions')
            .addIntegerOption(opt => opt.setName('from').setRequired(false))
            .addIntegerOption(opt => opt.setName('to').setRequired(false))
            .addIntegerOption(opt => opt.setName('page').setRequired(false))
            .addIntegerOption(opt => opt.setName('limit').setRequired(false)),

        async execute(interaction) {
            if (!IsAuthorized(interaction.user.id)) {
                return interaction.reply({ content: '❌ Not authorized.', ephemeral: true });
            }

            const from = interaction.options.getInteger('from');
            const to = interaction.options.getInteger('to');
            const page = interaction.options.getInteger('page') || 1;
            const limit = interaction.options.getInteger('limit') || 10;

            try {
                const query =
                    `?page=${page}&limit=${limit}` +
                    (from ? `&from=${from}` : '') +
                    (to ? `&to=${to}` : '');

                const res = await ApiGet('getallsessions', query);

                const sessions = res.data.data;

                if (!sessions.length) {
                    return interaction.reply('❌ No sessions found.');
                }

                const formatted = sessions
                    .slice(0, 10)
                    .map(s => {
                        const dur = s.duration
                            ? `${Math.floor(s.duration / 60000)}m`
                            : 'active';

                        return `• User ${s.userid} → ${dur}`;
                    })
                    .join('\n');

                return interaction.reply(`📊 All Sessions:\n${formatted}`);

            } catch {
                return interaction.reply('❌ Failed.');
            }
        }
    },

    // -------------------------
    // /addtimelogauthorized (OWNER)
    // -------------------------
    {
        data: new SlashCommandBuilder()
            .setName('addtimelogauthorized')
            .setDescription('Authorize user for timelog admin')
            .addUserOption(opt => opt.setName('user').setRequired(true)),

        async execute(interaction) {
            if (!IsOwner(interaction.user.id)) {
                return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
            }

            const user = interaction.options.getUser('user');

            AddAuthorizedUser(user.id);

            return interaction.reply(`✅ ${user.tag} authorized for timelog.`);
        }
    }
];

// -------------------------
// EXPORT
// -------------------------
module.exports = {
    commands: TimeLogCommands
};