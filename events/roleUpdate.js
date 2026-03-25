const axios = require('axios');
const { GetAllMappings } = require('../db/entitlements');

module.exports = (client) => {

    client.on('guildMemberUpdate', async (oldMember, newMember) => {

        const userId = newMember.id;

        const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

        if (addedRoles.size === 0 && removedRoles.size === 0) return;

        const entitlements = {};

        if (newMember.premiumSince) {
            entitlements["booster"] = true;
        } else {
            entitlements["booster"] = false;
        }

        const mappings = GetAllMappings();

        for (const mapping of mappings) {
            entitlements[mapping.Entitlement] = false;
        }

        for (const role of newMember.roles.cache.values()) {
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
            console.error('Failed to update entitlements', err?.response?.data || err.message);
        }
    });
};