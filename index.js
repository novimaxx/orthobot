const { Telegraf, Markup, session } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// ✅ Глобальный мидлвар для гарантии ctx.session
bot.use(async (ctx, next) => {
    if (!ctx.session) {
        ctx.session = {};
    }
    await next();
});

const mainMenu = require('./keyboards/mainMenu');
const casesMessage = require('./messages/cases');
const { ensureUserExists, getUserCourses, saveUtm } = require('./helpers/db');
const paidKeyboard = require('./keyboards/paidKeyboard');
const { linkReferralByCode } = require('./helpers/referrals');
const { showCoursePayment } = require('./scenes/courseScene');
const welcomeMessage = require('./messages/welcome');
const offlineCourse = require('./messages/offlineCourse');

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const payload = ctx.startPayload;

    if (payload) {
        if (payload.startsWith('ref')) {
            linkReferralByCode(payload, userId);
        } else if (payload.startsWith('utm_')) {
            saveUtm(userId, payload);

            // Если в UTM есть buy_ — показать оплату курса после приветствия
            const buyMatch = payload.match(/buy_(\w+)/);
            if (buyMatch) {
                const courseMap = {
                    'basic': 'Базовий',
                    'aligners': 'Елайнери',
                    'pro': 'Pro'
                };
                const courseName = courseMap[buyMatch[1]];
                if (courseName) {
                    ctx.session._pendingBuy = courseName;
                }
            }
        }
    }

    ensureUserExists(userId);

    const userCourses = getUserCourses(userId);
    const keyboardData = userCourses.length > 0 ? paidKeyboard() : mainMenu();

    try {
        await ctx.replyWithPhoto(
            { url: 'https://i.postimg.cc/cLpmDs1q/photo-2025-04-17-14-09-54-2.jpg' },
            {
                caption: welcomeMessage(ctx.from.first_name),
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: keyboardData.keyboard,
                    resize_keyboard: keyboardData.resize_keyboard,
                    one_time_keyboard: keyboardData.one_time_keyboard
                }
            }
        );
        // Если пришёл с buy_ ссылкой — сразу показать оплату
        if (ctx.session._pendingBuy) {
            const courseName = ctx.session._pendingBuy;
            ctx.session._pendingBuy = null;
            await showCoursePayment(ctx, courseName);
        }
    } catch (error) {
        console.error('❗ Ошибка отправки приветствия:', error.message);
    }
});

bot.hears('📂 Розбір кейсів', async (ctx) => {
    try {
        await ctx.reply(casesMessage.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: casesMessage.buttonText,
                            url: casesMessage.url
                        }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('❗ Ошибка отправки кейсов:', error.message);
    }
});

bot.hears('🏢 Офлайн Курси', async (ctx) => {
    try {
        // 1. Отправляем фото (без кнопки)
        await ctx.replyWithPhoto({ url: offlineCourse.photo });
        // 2. Отправляем текст с кнопкой
       await ctx.reply(
    offlineCourse.text,
    {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔗Перейти до передоплати', callback_data: 'offline_course_payment' }]
            ],
            remove_keyboard: true // Добавь это!
        }
    }
);
    } catch (error) {
        console.error('❗ Помилка надсилання офлайн курсу:', error.message);
    }
});

// После нажатия на "Перейти до предоплати"
bot.action('offline_course_payment', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `<b>Банківські реквізити для передоплати:</b>

🏦 <b>ФОП Штунь Денис Олександрович</b>
IBAN: <code>UA273220010000026005330147569</code>
ІПН/ЄДРПОУ: <code>3543105355</code>
Банк: Акціонерне товариство УНІВЕРСАЛ БАНК
МФО: <code>322001</code>
ОКПО Банку: <code>21133352</code>

📋 <b>В призначенні платежу вкажіть:</b> «Офлайн-навчання»

💰 <b>Сума передоплати:</b> <u>4180 UAH</u>

Після оплати, будь ласка, надішліть квитанцію та свої ПІБ і номер телефону через кнопку нижче 👇`,
        {
            parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📸 Надіслати квитанцію', callback_data: 'offline_send_receipt' }]
            ],
            remove_keyboard: true // важно для удаления старой обычной клавы!
        }
      }
   );
});

// Ждём чек (фото/документ/текст) и пересылаем админу с подписью пользователя
bot.action('offline_send_receipt', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.waiting_receipt = true;
    await ctx.reply('Будь ласка, надішліть фото/файл квитанції <b>разом з ПІБ і номером телефону</b> в одному повідомленні! Наприклад:\n\n<b>Іваненко Іван, +380991234567</b>', { parse_mode: 'HTML' });
});

// Принимаем файл и подпись
bot.on(['photo', 'document', 'text'], async (ctx, next) => {
    if (ctx.session.waiting_receipt) {
        let messageText = '';
        let fileId = null;
        let fileType = null;

        if (ctx.message.photo) {
            fileType = 'photo';
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            messageText = ctx.message.caption || '';
        } else if (ctx.message.document) {
            fileType = 'document';
            fileId = ctx.message.document.file_id;
            messageText = ctx.message.caption || '';
        } else if (ctx.message.text) {
            fileType = 'text';
            messageText = ctx.message.text;
        }

        if (!fileId && fileType !== 'text') {
            return ctx.reply('❗ Будь ласка, прикріпіть фото або файл квитанції разом із ПІБ і телефоном!');
        }

        const adminMsg = `📥 Нова квитанція!\n\n👤 ПІБ та телефон:\n${messageText}\n\n🆔 ID користувача: <code>${ctx.from.id}</code>`;
        const adminId = process.env.ADMIN_ID;

        try {
            if (fileType === 'photo') {
                await ctx.telegram.sendPhoto(adminId, fileId, { caption: adminMsg, parse_mode: 'HTML' });
            } else if (fileType === 'document') {
                await ctx.telegram.sendDocument(adminId, fileId, { caption: adminMsg, parse_mode: 'HTML' });
            } else {
                await ctx.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'HTML' });
            }
            await ctx.reply('✅ Дякуємо! Квитанцію отримано, ми перевіримо оплату і зв’яжемось з вами.');
        } catch (e) {
            await ctx.reply('❗ Помилка при надсиланні квитанції, спробуйте ще раз або напишіть у підтримку.');
        }

        ctx.session.waiting_receipt = false;
        return;
    }
    return next();
});

// Подключаем сцены
require('./scenes/courseScene')(bot);
require('./scenes/announcementScene')(bot);
require('./scenes/supportScene')(bot);
require('./scenes/paymentScene')(bot);
require('./scenes/certificateScene')(bot);

bot.launch();
console.log('🤖 Бот запущен...');
