const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('data/database.db');

// ✅ Создание таблиц, если ещё нет
db.prepare(`
    CREATE TABLE IF NOT EXISTS referrals (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             inviter_id INTEGER,
                                             inviter_code TEXT UNIQUE,
                                             invited_id INTEGER UNIQUE,
                                             registered_at TEXT
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS referral_bonuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inviter_id INTEGER,
        invited_id INTEGER,
        course_name TEXT,
        bonus_amount REAL,
        created_at TEXT
    )
`).run();

// 🔐 Генерация реферального кода
function generateReferralCode() {
    return 'ref' + crypto.randomBytes(4).toString('hex');
}

// 💾 Сохранить реферальный код
function saveReferralCode(userId) {
    const existing = db.prepare('SELECT inviter_code FROM referrals WHERE inviter_id = ?').get(userId);
    if (existing) return existing.inviter_code;

    const code = generateReferralCode();
    try {
        db.prepare('INSERT INTO referrals (inviter_id, inviter_code) VALUES (?, ?)').run(userId, code);
        return code;
    } catch (err) {
        console.error('❗ Помилка при збереженні коду реферала:', err.message);
        return null;
    }
}

// 🔗 Привязать приглашённого к пригласившему
function linkReferralByCode(code, invitedId) {
    try {
        db.prepare(`
            UPDATE referrals
            SET invited_id = ?, registered_at = ?
            WHERE inviter_code = ? AND invited_id IS NULL
        `).run(invitedId, new Date().toISOString(), code);

        console.log(`🧾 Користувач ${invitedId} успішно прив'язаний.`);
    } catch (err) {
        console.error('❗ Помилка при прив\'язці реферала:', err.message);
    }
}

// 🎁 Начисление бонуса каждый раз при оплате курса
function tryGiveBonus(invitedId, courseName) {
    const coursePrices = {
        'Базовий': 650,
        'Елайнери': 575,
        'Pro': 0
    };

    const referral = db.prepare('SELECT * FROM referrals WHERE invited_id = ?').get(invitedId);
    if (!referral) return null;

    const coursePrice = coursePrices[courseName] || 0;
    if (coursePrice === 0) return null;

    const bonusAmount = +(coursePrice * 0.05).toFixed(2);

    db.prepare(`
        INSERT INTO referral_bonuses (inviter_id, invited_id, course_name, bonus_amount, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(referral.inviter_id, invitedId, courseName, bonusAmount, new Date().toISOString());

    return { inviterId: referral.inviter_id, bonusAmount };
}

// 📊 Статистика рефералов
function getReferralStats(inviterId) {
    const totalReferrals = db.prepare('SELECT COUNT(DISTINCT invited_id) AS count FROM referrals WHERE inviter_id = ?').get(inviterId)?.count || 0;
    const totalBonus = db.prepare('SELECT SUM(bonus_amount) AS sum FROM referral_bonuses WHERE inviter_id = ?').get(inviterId)?.sum || 0;

    return {
        total: totalReferrals,
        cashbackUsd: (totalBonus || 0).toFixed(2)
    };
}

// 🧾 Получить приглашённых пользователей
function getInvitedUsers(inviterId) {
    return db.prepare('SELECT * FROM referrals WHERE inviter_id = ?').all(inviterId);
}

// 🔎 Найти реферала по ID
function findReferralByInvitedId(invitedId) {
    return db.prepare('SELECT * FROM referrals WHERE invited_id = ?').get(invitedId);
}

module.exports = {
    saveReferralCode,
    linkReferralByCode,
    tryGiveBonus,
    getReferralStats,
    getInvitedUsers,
    findReferralByInvitedId
};
