const Database = require('better-sqlite3');
const db = new Database('data/database.db');

// ✅ Создание таблицы пользователей
db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
                                         id INTEGER PRIMARY KEY,
                                         name TEXT,
                                         email TEXT,
                                         phone TEXT,
                                         education TEXT,
                                         city TEXT,
                                         birth TEXT,
                                         job TEXT,
                                         position TEXT,
                                         course TEXT,
                                         step TEXT,
                                         created_at TEXT,
                                         awaiting_payment TEXT
    )
`).run();

// ✅ Создание таблицы курсов пользователя
db.prepare(`
    CREATE TABLE IF NOT EXISTS user_courses (
                                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                user_id INTEGER,
                                                course_name TEXT,
                                                started_at TEXT,
                                                access_granted INTEGER DEFAULT 0
    )
`).run();

// ✅ Создание таблицы анонсов
db.prepare(`
    CREATE TABLE IF NOT EXISTS announcements (
                                                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                 type TEXT,
                                                 content TEXT,
                                                 file_id TEXT,
                                                 created_at TEXT
    )
`).run();

// ✅ Создание таблицы платежей
db.prepare(`
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        course TEXT,
        file_id TEXT,
        text TEXT,
        created_at TEXT
    )
`).run();

// ✅ Создание таблицы UTM трекинга
db.prepare(`
    CREATE TABLE IF NOT EXISTS utm_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        raw_param TEXT,
        created_at TEXT
    )
`).run();

// --- Функции ---
function addAnnouncement({ content, type = null, file_id = null }) {
    const stmt = db.prepare(`INSERT INTO announcements (content, type, file_id, created_at) VALUES (?, ?, ?, ?)`);
    stmt.run(content, type, file_id, new Date().toISOString());
}

function getLastAnnouncements(limit = 5) {
    return db.prepare(`
        SELECT * FROM announcements
        ORDER BY created_at DESC
        LIMIT ?
    `).all(limit);
}

function deleteAnnouncement(id) {
    return db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
}

function ensureUserExists(userId) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
        db.prepare('INSERT INTO users (id) VALUES (?)').run(userId);
        console.log(`🧾 Користувач ${userId} доданий до бази.`);
    }
}

function saveUserField(userId, field, value) {
    const validFields = [
        'name', 'email', 'phone', 'education', 'city', 'birth',
        'job', 'position', 'course', 'step', 'created_at', 'awaiting_payment', 'is_premium'
    ];
    if (!validFields.includes(field)) {
        console.warn(`⚠️ Недопустиме поле: ${field}`);
        return;
    }

    ensureUserExists(userId);
    console.log(`💾 Збереження поля: ${field} = ${value} для користувача ${userId}`);
    db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(value, userId);
}

function getUser(userId) {
    ensureUserExists(userId);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function setCourse(userId, course) {
    saveUserField(userId, 'course', course);
}

function addUserCourse(userId, courseName) {
    ensureUserExists(userId);
    db.prepare(`
        INSERT INTO user_courses (user_id, course_name, started_at, access_granted)
        VALUES (?, ?, ?, 1)
    `).run(userId, courseName, new Date().toISOString());
}

function getUserCourses(userId) {
    ensureUserExists(userId);
    return db.prepare(`
        SELECT * FROM user_courses
        WHERE user_id = ? AND access_granted = 1
    `).all(userId);
}

function hasUserCourse(userId, courseName) {
    ensureUserExists(userId);
    const course = db.prepare(`
        SELECT * FROM user_courses
        WHERE user_id = ? AND course_name = ? AND access_granted = 1
    `).get(userId, courseName);
    return !!course;
}

function getAllUsers() {
    return db.prepare('SELECT id FROM users').all();
}

// --- UTM функции ---
function saveUtm(userId, rawParam) {
    const existing = db.prepare('SELECT id FROM utm_tracking WHERE user_id = ?').get(userId);
    if (existing) return; // уже есть UTM для этого юзера

    // Формат: utm_SOURCE_MEDIUM_CAMPAIGN или utm_SOURCE_CAMPAIGN
    const parts = rawParam.replace(/^utm_/, '').split('_');
    const source = parts[0] || null;
    const medium = parts[1] || null;
    const campaign = parts.slice(2).join('_') || null;

    db.prepare(`
        INSERT INTO utm_tracking (user_id, utm_source, utm_medium, utm_campaign, raw_param, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, source, medium, campaign, rawParam, new Date().toISOString());
}

function getUtmByUser(userId) {
    return db.prepare('SELECT * FROM utm_tracking WHERE user_id = ?').get(userId);
}

function getUtmStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM utm_tracking').get().count;

    const bySource = db.prepare(`
        SELECT utm_source, COUNT(*) as users,
        (SELECT COUNT(*) FROM user_courses uc
         INNER JOIN utm_tracking ut2 ON uc.user_id = ut2.user_id
         WHERE ut2.utm_source = utm_tracking.utm_source AND uc.access_granted = 1) as paid
        FROM utm_tracking
        GROUP BY utm_source
        ORDER BY users DESC
    `).all();

    const byCampaign = db.prepare(`
        SELECT utm_source, utm_campaign, COUNT(*) as users,
        (SELECT COUNT(*) FROM user_courses uc
         INNER JOIN utm_tracking ut2 ON uc.user_id = ut2.user_id
         WHERE ut2.utm_source = utm_tracking.utm_source
         AND ut2.utm_campaign = utm_tracking.utm_campaign AND uc.access_granted = 1) as paid
        FROM utm_tracking
        WHERE utm_campaign IS NOT NULL
        GROUP BY utm_source, utm_campaign
        ORDER BY users DESC
    `).all();

    return { total, bySource, byCampaign };
}

// --- Экспорт ---
module.exports = {
    db,
    saveUserField,
    getUser,
    setCourse,
    ensureUserExists,
    addUserCourse,
    getUserCourses,
    hasUserCourse,
    addAnnouncement,
    getLastAnnouncements,
    deleteAnnouncement,
    getAllUsers,
    saveUtm,
    getUtmByUser,
    getUtmStats
};
