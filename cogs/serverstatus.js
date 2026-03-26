/*
    cogs/serverStatus.js
    ─────────────────────────────────────────────
    Commands:
      /sendpublicstatushook  — posts a live status embed to a channel
                               and stores the message ID for auto-updates

    Events:
      ready  — starts a polling loop that edits the stored status message
               every 60 seconds with fresh data from the API
*/

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

// ─────────────────────────────────────────────
// Persist the pinned message between restarts
// ─────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, '..', 'data', 'statusHook.json');

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
        return {};   // { channelId, messageId }
    }
}

function saveState(state) {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────
// API helper
// ─────────────────────────────────────────────
async function fetchServerStatus() {
    const serverId = process.env.RUST_SERVER_ID ?? 'server-1';

    const res = await axios.get(
        `${process.env.API_BASE}/server/${serverId}/status`,
        { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
    );

    return res.data;   // { success, status, snapshot, mapImage }
}


// ─────────────────────────────────────────────
// Build the public-facing embed
// ─────────────────────────────────────────────
function buildStatusEmbed(data) {
    const { status, snapshot, mapImage } = data;

    const online   = status?.status === 'online';
    const players  = status?.player_count  ?? 0;
    const maxP     = status?.max_players   ?? 0;
    const sleeping = status?.sleeping_count ?? 0;
    const fps      = status?.fps != null ? Math.round(status.fps) : '—';

    const mapName  = snapshot?.map_name  ?? 'Procedural Map';
    const mapSize  = snapshot?.map_size  ?? '—';
    const mapSeed  = snapshot?.map_seed  ?? '—';
    const gameVer  = snapshot?.game_version ?? '—';

    const statusLine = online
        ? `🟢 **Online** — ${players}/${maxP} players`
        : '🔴 **Offline**';

    const playerBar = maxP > 0
        ? buildBar(players, maxP, 20)
        : '──────────────────────';

    const embed = new EmbedBuilder()
        .setColor(online ? 0x2ecc71 : 0xe74c3c)
        .setTitle('🦀 Rust Server Status')
        .setDescription(statusLine)
        .addFields(
            {
                name: '👥 Players',
                value: `\`${playerBar}\`\n${players} active · ${sleeping} sleeping`,
                inline: false
            },
            {
                name: '🗺️ Map',
                value: [
                    `**Name:** ${mapName}`,
                    `**Size:** ${mapSize}`,
                    `**Seed:** ${mapSeed}`
                ].join('\n'),
                inline: true
            },
            {
                name: '⚙️ Server',
                value: [
                    `**FPS:** ${fps}`,
                    `**Version:** ${gameVer}`
                ].join('\n'),
                inline: true
            }
        )
        .setFooter({ text: `Last updated` })
        .setTimestamp();

    if (mapImage) {
        embed.setImage(mapImage);
    }

    return embed;
}

function buildBar(value, max, width) {
    const filled = Math.round((value / max) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ─────────────────────────────────────────────
// Build the action row (Join button)
// ─────────────────────────────────────────────
function buildComponents(data) {
    const mapSize = data?.snapshot?.map_size ?? 3000;
    const mapSeed = data?.snapshot?.map_seed ?? 5000;

    const connectUrl = process.env.RUST_CONNECT_URL;

    const row = new ActionRowBuilder();

    if (connectUrl) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel('🎮 Join Server')
                .setStyle(ButtonStyle.Link)
                .setURL(connectUrl)
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setLabel('🗺️ Map')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://rustmaps.com/map/${mapSize}_${mapSeed}`)
    );

    return row;
}
// ─────────────────────────────────────────────
// Core update function — used by both the
// command (first post) and the polling loop
// ─────────────────────────────────────────────
async function updateStatusMessage(client) {
    const state = loadState();
    if (!state.channelId || !state.messageId) return;

    try {
        const channel = await client.channels.fetch(state.channelId);
        if (!channel) return;

        const message = await channel.messages.fetch(state.messageId);
        if (!message) return;

        const data  = await fetchServerStatus();
        const embed = buildStatusEmbed(data);
        const row   = buildComponents();

        await message.edit({ embeds: [embed], components: [row] });
    } catch (err) {
        // Message deleted or channel gone — clear state
        if (err.code === 10008 || err.code === 10003) {
            console.warn('[serverStatus] Pinned message gone, clearing state.');
            saveState({});
        } else {
            console.error('[serverStatus] Update failed:', err.message);
        }
    }
}

// ─────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────
const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('sendpublicstatushook')
            .setDescription('Post a live server status embed to this channel')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('Channel to post in (defaults to current)')
                    .setRequired(false)
            ),

        async execute(interaction, client) {
            await interaction.deferReply({ ephemeral: true });

            const target = interaction.options.getChannel('channel') ?? interaction.channel;

            let data;
            try {
                data = await fetchServerStatus();
            } catch (err) {
                console.error('[serverStatus] API fetch failed:', err.message);
                return interaction.editReply('❌ Could not reach the server API.');
            }

            const embed = buildStatusEmbed(data);
            const row   = buildComponents(data);

            const posted = await target.send({ embeds: [embed], components: [row] });

            saveState({ channelId: target.id, messageId: posted.id });

            return interaction.editReply(
                `✅ Status hook posted in <#${target.id}>. It will auto-update every 60 seconds.`
            );
        }
    }
];

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
const POLL_INTERVAL_MS = 60_000;

const events = [
    {
        name: 'ready',
        once: true,
        async execute(_readyClient, client) {
            console.log('[serverStatus] Starting status poll loop.');

            // Run immediately on boot then on interval
            await updateStatusMessage(client);

            setInterval(() => updateStatusMessage(client), POLL_INTERVAL_MS);
        }
    }
];

// ─────────────────────────────────────────────
// COG EXPORT
// ─────────────────────────────────────────────
module.exports = { commands, events };