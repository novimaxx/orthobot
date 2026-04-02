const adminIds = (process.env.ADMIN_ID || '').split(',').map(id => Number(id.trim())).filter(Boolean);
const statsIds = (process.env.STATS_IDS || '').split(',').map(id => Number(id.trim())).filter(Boolean);

function isAdmin(id) {
    return adminIds.includes(id);
}

function canViewStats(id) {
    return adminIds.includes(id) || statsIds.includes(id);
}

function getAdminIds() {
    return adminIds;
}

async function notifyAdmins(telegram, text, options = {}) {
    for (const id of adminIds) {
        try {
            await telegram.sendMessage(id, text, options);
        } catch (err) {
            console.error(`Failed to notify admin ${id}:`, err.message);
        }
    }
}

async function notifyAdminsPhoto(telegram, photo, options = {}) {
    for (const id of adminIds) {
        try {
            await telegram.sendPhoto(id, photo, options);
        } catch (err) {
            console.error(`Failed to notify admin ${id}:`, err.message);
        }
    }
}

module.exports = { isAdmin, canViewStats, getAdminIds, notifyAdmins, notifyAdminsPhoto };
