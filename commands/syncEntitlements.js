const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { GetAllMappings } = require('../db/entitlements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('syncents')
        .setDescription('Force resync your entitlements'),

    async execute(interaction) {
        const member = interaction.member;
        const userId = member.id;

        const entitlements = {};
        const mappings = GetAllMappings();

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

            await interaction.reply('✅ Entitlements synced!');
        } catch (err) {
            await interaction.reply('❌ Failed to sync.');
        }
    }
};