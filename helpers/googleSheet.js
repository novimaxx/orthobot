let doc;
try {
    const { GoogleSpreadsheet } = require('google-spreadsheet');
    const creds = require('./credentials.json');
    doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    doc._creds = creds;
} catch (err) {
    console.warn('⚠️ Google Sheets credentials not found, skipping integration');
    doc = null;
}

async function appendUser(user) {
    if (!doc) return;
    try {
        await doc.useServiceAccountAuth(doc._creds);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        await sheet.addRow({
            id: user.id,
            name: user.name || '',
            email: user.email || '',
            phone: user.phone || '',
            education: user.education || '',
            city: user.city || '',
            birth: user.birth || '',
            job: user.job || '',
            position: user.position || '',
            course: user.course || '',
            step: user.step || '',
            created_at: user.created_at || new Date().toISOString(),
        });

        console.log('✅ Дані додано до Google Sheet');
    } catch (err) {
        console.error('❌ Помилка запису в таблицю:', err.message);
    }
}

module.exports = { appendUser };
