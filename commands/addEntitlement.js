const { SlashCommandBuilder } = require('discord.js');
const { SetEntitlement } = require('../db/entitlements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addentitlement')
        .setDescription('Map a role to an entitlement')
        .addRoleOption(opt =>
            opt.setName('role')
                .setDescription('Role to map')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('entitlement')
                .setDescription('Entitlement name (any key)')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ No permission', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        let entitlement = interaction.options.getString('entitlement');

        // 🔥 normalize (important)
        entitlement = entitlement.toLowerCase().trim();

        if (!/^[a-z0-9_]+$/.test(entitlement)) {
            return interaction.reply({
                content: '❌ Entitlement must be lowercase alphanumeric (e.g. vip, kit_gold)',
                ephemeral: true
            });
        }

        SetEntitlement(role.id, entitlement);

        await interaction.reply(`✅ Saved: ${role.name} → ${entitlement}`);
    }
};