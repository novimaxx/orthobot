const { db } = require('./db'); // 👈 с фигурными скобками!

function savePayment({ userId, course, fileId = null, text = null }) {
    db.prepare(`
        INSERT INTO payments (user_id, course, file_id, text, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(userId, course, fileId, text, new Date().toISOString());
}

function getAllPayments() {
    return db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all();
}

module.exports = { savePayment, getAllPayments };
