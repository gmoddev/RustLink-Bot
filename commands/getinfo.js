const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('getinfo')
        .setDescription('Get linked account info')
        .addStringOption(opt =>
            opt.setName('platform')
                .setDescription('Platform (steam, roblox, discord)')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('id')
                .setDescription('Platform ID')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const adminId = interaction.user.id;
        const platform = interaction.options.getString('platform');
        const id = interaction.options.getString('id');

        try {
            const res = await axios.post(
                `${process.env.API_BASE}/get-info`,
                {
                    platform,
                    platformId: id,
                    adminId
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.API_KEY}`
                    }
                }
            );

            if (!res.data.success) {
                return interaction.reply({
                    content: '❌ Not found.',
                    ephemeral: true
                });
            }

            const accounts = res.data.accounts
                .map(a => `${a.platform}: ${a.platformid}`)
                .join('\n');

            const entitlements = Object.entries(res.data.entitlements)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n');

            await interaction.reply({
                content:
`📊 **Account Info**
**Accounts:**
${accounts}

**Entitlements:**
${entitlements}`,
                ephemeral: true
            });

        } catch (err) {
            console.error(err);
            await interaction.reply({
                content: '❌ API error.',
                ephemeral: true
            });
        }
    }
};