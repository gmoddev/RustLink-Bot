// src/db/entitlements.js
const db = require('../database');

function SetEntitlement(RoleId, Entitlement) {
    db.prepare(`
        INSERT INTO RoleEntitlements (RoleId, Entitlement)
        VALUES (?, ?)
        ON CONFLICT(RoleId) DO UPDATE SET Entitlement = excluded.Entitlement
    `).run(RoleId, Entitlement);
}

function GetAllMappings() {
    return db.prepare(`SELECT * FROM RoleEntitlements`).all();
}

function GetEntitlement(RoleId) {
    return db.prepare(`
        SELECT Entitlement FROM RoleEntitlements WHERE RoleId = ?
    `).get(RoleId);
}

module.exports = {
    SetEntitlement,
    GetAllMappings,
    GetEntitlement
};