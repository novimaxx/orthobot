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
const { ensureUserExists, getUserCourses } = require('./helpers/db');
const paidKeyboard = require('./keyboards/paidKeyboard');
const { linkReferralByCode } = require('./helpers/referrals');
const welcomeMessage = require('./messages/welcome');

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const payload = ctx.startPayload;

    if (payload && payload.startsWith('ref')) {
        linkReferralByCode(payload, userId);
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

// Подключаем сцены
require('./scenes/courseScene')(bot);
require('./scenes/announcementScene')(bot);
require('./scenes/supportScene')(bot);
require('./scenes/paymentScene')(bot);
require('./scenes/certificateScene')(bot);

bot.launch();
console.log('🤖 Бот запущен...');
