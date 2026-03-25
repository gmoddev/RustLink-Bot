const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { GetAllMappings } = require('../db/entitlements');

// -------------------------
// Throttle Settings
// -------------------------
const CooldownSeconds = 10;
const Cooldowns = new Map();

let LastGlobalCall = 0;
const GlobalCooldownMs = 250;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Rust account')
        .addStringOption(opt =>
            opt.setName('code')
                .setDescription('Your in-game code')
                .setRequired(true)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const now = Date.now();

        // -------------------------
        // USER COOLDOWN
        // -------------------------
        if (Cooldowns.has(userId)) {
            const expires = Cooldowns.get(userId);

            if (now < expires) {
                const remaining = ((expires - now) / 1000).toFixed(1);
                return interaction.reply({
                    content: `⏳ Please wait ${remaining}s before trying again.`,
                    ephemeral: true
                });
            }
        }

        Cooldowns.set(userId, now + CooldownSeconds * 1000);
        setTimeout(() => Cooldowns.delete(userId), CooldownSeconds * 1000);

        // -------------------------
        // GLOBAL THROTTLE
        // -------------------------
        if (now - LastGlobalCall < GlobalCooldownMs) {
            return interaction.reply({
                content: '⚠️ System is busy, try again in a moment.',
                ephemeral: true
            });
        }

        LastGlobalCall = now;

        const code = interaction.options.getString('code');

        try {
            const res = await axios.post(
                `${process.env.API_BASE}/link`,
                {
                    code,
                    discordId: userId
                }
            );

            if (!res.data.success) {
                return interaction.reply('❌ Invalid or expired code.');
            }

            // -------------------------
            // 🔥 SYNC ENTITLEMENTS AFTER LINK
            // -------------------------
            const member = interaction.member;
            const mappings = GetAllMappings();
            const entitlements = {};

            // Booster
            entitlements["booster"] = !!member.premiumSince;

            // Init all mapped entitlements
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

            await interaction.reply('✅ Account linked & synced successfully!');

        } catch (err) {
            console.error('link error:', err?.response?.data || err.message);
            await interaction.reply('❌ API error.');
        }
    }
};