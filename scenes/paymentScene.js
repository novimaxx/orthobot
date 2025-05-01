const { savePayment } = require('../helpers/payments');
const { handleSuccessfulPayment } = require('../helpers/handleSuccessfulPayment');
const { getUser, saveUserField } = require('../helpers/db');
const { Markup } = require('telegraf');

function registerPaymentScene(bot) {

    bot.action(/^approve_(\d+)_(.+)$/, async (ctx) => {
        const userId = Number(ctx.match[1]);
        const courseName = ctx.match[2];

        await handleSuccessfulPayment(bot, userId, courseName);

        await ctx.answerCbQuery('✅ Доступ видано');
        await ctx.editMessageReplyMarkup();
    });

    bot.action(/^reject_(\d+)$/, async (ctx) => {
        const userId = Number(ctx.match[1]);
        await ctx.telegram.sendMessage(userId, '❌ Оплату не підтверджено. Будь ласка, перевірте дані і спробуйте ще раз.');
        await ctx.answerCbQuery('🚫 Відхилено');
        await ctx.editMessageReplyMarkup();
    });

    bot.on('photo', async (ctx, next) => {
        const userId = ctx.from.id;
        const user = getUser(userId);
        const course = user?.awaiting_payment;
        if (!course) return next();

        const fileId = ctx.message.photo.pop().file_id;
        const username = ctx.from.username ? `@${ctx.from.username}` : 'немає';
        const adminId = Number(process.env.ADMIN_ID);

        await savePayment({ userId, course, fileId });

        await ctx.telegram.sendPhoto(adminId, fileId, {
            caption: `🧾 Новий платіж на перевірку\n👤 ${ctx.from.first_name} (${username})\n📘 ${course}\n🆔 ${userId}`,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(`✅ Видати курс (${userId})`, `approve_${userId}_${course}`),
                    Markup.button.callback('❌ Відхилити', `reject_${userId}`)]
            ])
        });

        await ctx.reply('✅ Дякуємо! Вашу квитанцію передано на перевірку.');
        saveUserField(userId, 'awaiting_payment', null);
    });

    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id;
        const user = getUser(userId);
        const course = user?.awaiting_payment;
        if (!course) return next();

        const username = ctx.from.username ? `@${ctx.from.username}` : 'немає';
        const adminId = Number(process.env.ADMIN_ID);

        await savePayment({ userId, course, text: ctx.message.text });

        await ctx.telegram.sendMessage(adminId, `🧾 Новий текстовий платіж\n👤 ${ctx.from.first_name} (${username})\n📘 ${course}\n🆔 ${userId}\n\n✉️ ${ctx.message.text}`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(`✅ Видати курс (${userId})`, `approve_${userId}_${course}`),
                    Markup.button.callback('❌ Відхилити', `reject_${userId}`)]
            ])
        });

        await ctx.reply('✅ Дякуємо! Вашу інформацію передано на перевірку.');
        saveUserField(userId, 'awaiting_payment', null);
    });

}

module.exports = registerPaymentScene;
