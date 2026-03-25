const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove-link')
        .setDescription('Remove a linked account')
        .addStringOption(opt =>
            opt.setName('steamid')
                .setDescription('Steam ID')
                .setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName('discordid')
                .setDescription('Discord ID')
                .setRequired(false)
        ),

    async execute(interaction) {
        const steamId = interaction.options.getString('steamid');
        const discordId = interaction.options.getString('discordid');

        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ No permission', ephemeral: true });
        }

        if (!steamId && !discordId) {
            return interaction.reply({
                content: '❌ Provide a Steam ID or Discord ID.',
                ephemeral: true
            });
        }

        try {
            const res = await axios.post(
                `${process.env.API_BASE}/remove-link`,
                {
                    steamId,
                    discordId
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.API_KEY}`
                    }
                }
            );

            if (!res.data.success) {
                return interaction.reply({
                    content: `❌ ${res.data.error}`,
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: `✅ Link removed\nSteam: ${res.data.steamId}\nDiscord: ${res.data.discordId}`,
                ephemeral: true
            });

        } catch (err) {
            return interaction.reply({
                content: '❌ API error.',
                ephemeral: true
            });
        }
    }
};