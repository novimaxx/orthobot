const express = require('express');
const app = express();
const port = 3001;
const crypto = require('crypto');
require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const courseKeyMap = {
    'Базовий': 'basic',
    'Елайнери': 'aligners',
    'Pro': 'pro'
};

const courseNameMap = {
    'basic': 'Базовий',
    'aligners': 'Елайнери',
    'pro': 'Pro'
};

function generateWayForPayForm(userId, courseName, amount) {
    const merchantAccount = process.env.MERCHANT_ACCOUNT || 'stomat_podcast_com_ua';
    const secretKey = process.env.SECRET_KEY || 'cbab689d5545a0ce0b5d8e3ca780466139677db0';
    const domain = process.env.DOMAIN || 'stomat-podcast.com.ua';
    const paymentUrl = process.env.PAYMENT_URL || `http://localhost:${port}`;

    const courseKey = courseKeyMap[courseName] || 'basic';
    const orderReference = `order-${userId}-${courseKey}-${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);

    const productName = [`${courseName} — Онлайн-школа ортодонтії від А до Я`];
    const productCount = [1];
    const productPrice = [amount];

    const signatureSource = [
        merchantAccount,
        domain,
        orderReference,
        orderDate,
        amount,
        'UAH',
        productName.join(';'),
        productCount.join(';'),
        productPrice.join(';'),
    ].join(';');

    const signature = crypto
        .createHmac('md5', secretKey)
        .update(signatureSource)
        .digest('hex');

    return `
        <html>
        <body>
<form id="payForm" method="POST" action="https://secure.wayforpay.com/pay" style="display:none">
        <input type="hidden" name="merchantAccount" value="${merchantAccount}" />
        <input type="hidden" name="merchantDomainName" value="${domain}" />
        <input type="hidden" name="merchantTransactionSecureType" value="AUTO" />
        <input type="hidden" name="language" value="UA" />
        <input type="hidden" name="orderReference" value="${orderReference}" />
        <input type="hidden" name="orderDate" value="${orderDate}" />
        <input type="hidden" name="amount" value="${amount}" />
        <input type="hidden" name="currency" value="UAH" />
        <input type="hidden" name="productLogo" value="https://s10.iimage.su/s/02/g1YEjwNxstEfAmi439LovVgsnrvZCwFqCAm9iMXjJ.jpg" />
        <input type="hidden" name="productName" value="${productName.join(';')}" />
        <input type="hidden" name="productCount" value="${productCount.join(';')}" />
        <input type="hidden" name="productPrice" value="${productPrice.join(';')}" />
        <input type="hidden" name="orderDesc" value="Оплата онлайн-навчання: ${courseName}" />
        <input type="hidden" name="clientFirstName" value="" />
        <input type="hidden" name="clientEmail" value="" />
        <input type="hidden" name="clientPhone" value="" />
        <input type="hidden" name="paymentSystems" value="card;googlePay;applePay;privat24;monobank" />
        <input type="hidden" name="serviceUrl" value="${paymentUrl}/webhook" />
        <input type="hidden" name="returnUrl" value="${paymentUrl}/success?course=${courseKey}" />
        <input type="hidden" name="merchantSignature" value="${signature}" />
    </form>
            <script>document.getElementById('payForm').submit();</script>
        </body>
        </html>
    `;
}

function renderSuccess(courseKey, res) {
    const courseName = courseNameMap[courseKey] || courseKey;
    const botLink = `https://t.me/Ortho_SchoolBot?start=open_${courseKey}`;

    res.send(`
        <!DOCTYPE html>
        <html lang="uk">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Оплата успішна — OrthoSchool</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .card {
                    background: white;
                    border-radius: 24px;
                    padding: 48px 40px;
                    max-width: 480px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                }
                .check { font-size: 72px; margin-bottom: 20px; }
                h1 { font-size: 28px; color: #1a1a2e; margin-bottom: 12px; font-weight: 700; }
                p { color: #666; font-size: 16px; line-height: 1.6; margin-bottom: 28px; }
                .course-badge {
                    background: #f0f4ff;
                    border-radius: 12px;
                    padding: 14px 24px;
                    color: #5b6cff;
                    font-weight: 700;
                    font-size: 18px;
                    margin-bottom: 32px;
                    display: inline-block;
                }
                .btn {
                    display: block;
                    background: #2AABEE;
                    color: white;
                    text-decoration: none;
                    padding: 18px 40px;
                    border-radius: 14px;
                    font-size: 18px;
                    font-weight: 700;
                    transition: transform 0.1s, background 0.2s;
                }
                .btn:hover { background: #1a96d4; transform: scale(1.02); }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="check">🎉</div>
                <h1>Оплату підтверджено!</h1>
                <div class="course-badge">📘 ${courseName}</div>
                <p>Вітаємо! Ваш доступ до курсу вже активовано. Натисніть кнопку нижче щоб одразу розпочати навчання.</p>
                <a href="${botLink}" class="btn">🎓 Розпочати навчання</a>
            </div>
        </body>
        </html>
    `);
}

// WayForPay робить POST на returnUrl
app.post('/success', (req, res) => {
    const courseKey = req.query.course || req.body.course || 'basic';
    renderSuccess(courseKey, res);
});

app.get('/success', (req, res) => {
    const courseKey = req.query.course || 'basic';
    renderSuccess(courseKey, res);
});

// Захист від дублікатів — зберігаємо в SQLite
const Database = require('better-sqlite3');
const db = new Database('./data/database.db');
db.exec(`CREATE TABLE IF NOT EXISTS processed_orders (
    order_reference TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now'))
)`);

function isOrderProcessed(orderRef) {
    return !!db.prepare('SELECT 1 FROM processed_orders WHERE order_reference = ?').get(orderRef);
}
function markOrderProcessed(orderRef) {
    db.prepare('INSERT OR IGNORE INTO processed_orders (order_reference) VALUES (?)').run(orderRef);
}

// Webhook від WayForPay — автоматична видача доступу
app.post('/webhook', async (req, res) => {
    try {
        let data = req.body;

        // WayForPay надсилає JSON як ключ у form-encoded body — парсимо
        const bodyKeys = Object.keys(data);
        if (bodyKeys.length === 1 && bodyKeys[0].startsWith('{')) {
            try {
                data = JSON.parse(bodyKeys[0]);
            } catch(e) {
                console.error('❌ Failed to parse webhook body:', e.message);
            }
        }
        const secretKey = process.env.SECRET_KEY || 'cbab689d5545a0ce0b5d8e3ca780466139677db0';

        const {
            merchantAccount,
            orderReference,
            amount,
            currency,
            authCode,
            cardPan,
            transactionStatus,
            reasonCode,
            merchantSignature
        } = data;

        // Перевірка підпису від WayForPay
        const signatureSource = [
            merchantAccount,
            orderReference,
            amount,
            currency,
            authCode,
            cardPan,
            transactionStatus,
            reasonCode
        ].join(';');

        const expectedSignature = crypto
            .createHmac('md5', secretKey)
            .update(signatureSource)
            .digest('hex');

        if (merchantSignature !== expectedSignature) {
            console.error('❌ Невірний підпис від WayForPay');
            return res.status(400).json({ status: 'error', message: 'Invalid signature' });
        }

        // Захист від дублікатів
        if (isOrderProcessed(orderReference)) {
            console.log(`⚠️ Дублікат webhook: ${orderReference}`);
            const responseSignature = crypto.createHmac('md5', secretKey).update(`${orderReference};accept`).digest('hex');
            return res.json({ orderReference, status: 'accept', time: Math.floor(Date.now() / 1000), signature: responseSignature });
        }

        if (transactionStatus === 'Approved') {
            markOrderProcessed(orderReference);
            // Парсимо orderReference: order-USERID-COURSEKEY-TIMESTAMP
            const parts = orderReference.split('-');
            const userId = parts[1];
            const courseKey = parts[2];
            const courseName = courseNameMap[courseKey] || courseKey;

            if (userId && courseName) {
                const { addUserCourse } = require('./helpers/db');
                addUserCourse(userId, courseName);
                console.log(`✅ Автооплата підтверджена: userId=${userId}, course=${courseName}`);

                // Повідомлення користувачу з кнопкою "Розпочати навчання"
                const { Telegraf, Markup } = require('telegraf');
                const bot = new Telegraf(process.env.BOT_TOKEN);

                await bot.telegram.sendMessage(userId,
                    `🎉 <b>Оплату підтверджено!</b>\n\n✅ Курс <b>${courseName}</b> активовано!\n\nНатисніть кнопку нижче щоб розпочати навчання 👇`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.url('🎓 Розпочати навчання', `https://t.me/Ortho_SchoolBot?start=open_${courseKey}`)]
                        ])
                    }
                );

                // Повідомлення адмінам
                const { notifyAdmins } = require('./helpers/admins');
                await notifyAdmins(bot.telegram,
                    `💰 <b>Нова автооплата через WayForPay!</b>\n\n🎓 Курс: <b>${courseName}</b>\n👤 User ID: <code>${userId}</code>\n💵 Сума: <b>${amount} ${currency}</b>`,
                    { parse_mode: 'HTML' }
                );
            }
        }

        // Відповідь для WayForPay (обов'язково)
        const responseSignature = crypto
            .createHmac('md5', secretKey)
            .update(`${orderReference};accept`)
            .digest('hex');

        res.json({
            orderReference,
            status: 'accept',
            time: Math.floor(Date.now() / 1000),
            signature: responseSignature
        });

    } catch (err) {
        console.error('❌ Webhook error:', err.message);
        res.status(500).json({ status: 'error' });
    }
});

app.get('/pay', (req, res) => {
    const { userId, courseName, amount } = req.query;

    if (!userId || !courseName || !amount) {
        return res.status(400).send('Missing parameters');
    }

    const formHtml = generateWayForPayForm(userId, courseName, amount);
    res.send(formHtml);
});

app.listen(port, () => {
    console.log(`💳 Payment server running at http://localhost:${port}`);
});
