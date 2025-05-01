const { Markup } = require('telegraf');
const { getUser } = require('../helpers/db');
const paidKeyboard = require('../keyboards/paidKeyboard');
require('dotenv').config();

const adminId = Number(process.env.ADMIN_ID);

function registerSupportScene(bot) {
    console.log('🛟 Підтримка загружена');

    bot.hears('🛟 Підтримка', async (ctx) => {
        ctx.session.support = true;
        await ctx.reply(
            '✉️ Напишіть повідомлення або задайте питання. Ми відповімо якомога швидше.',
            { reply_markup: { remove_keyboard: true } }
        );
    });

    bot.on('message', async (ctx, next) => {
        const replyTo = ctx.session?.replyTo;

        // Ответ от админа пользователю
        if (replyTo) {
            ctx.session.replyTo = null;

            try {
                const msg = ctx.message;

                if (msg.photo) {
                    const fileId = msg.photo.at(-1).file_id;
                    await ctx.telegram.sendPhoto(replyTo, fileId, { caption: msg.caption || '' });
                } else if (msg.document) {
                    await ctx.telegram.sendDocument(replyTo, msg.document.file_id, { caption: msg.caption || '' });
                } else if (msg.video) {
                    await ctx.telegram.sendVideo(replyTo, msg.video.file_id, { caption: msg.caption || '' });
                } else if (msg.text) {
                    await ctx.telegram.sendMessage(replyTo, `🛟 <b>Підтримка відповідає</b>\n\n${msg.text}`, {
                        parse_mode: 'HTML'
                    });
                } else {
                    return ctx.reply('❌ Тип повідомлення не підтримується.');
                }

                return ctx.reply('✅ Відповідь надіслана.');
            } catch (err) {
                console.error('❗ Помилка при відповіді користувачу:', err.message);
                return ctx.reply('❌ Не вдалося надіслати відповідь користувачу.');
            }
        }

        // Обработка обращения в поддержку
        if (ctx.session?.support) {
            ctx.session.support = false;

            const from = ctx.from;
            const msg = ctx.message;
            const senderInfo = `👤 ${from.first_name} (@${from.username || 'немає'}) [${from.id}]`;

            try {
                if (msg.photo) {
                    const fileId = msg.photo.at(-1).file_id;
                    await ctx.telegram.sendPhoto(adminId, fileId, {
                        caption: `📩 <b>Підтримка</b>\n\n${senderInfo}`,
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([[Markup.button.callback(`📨 Відповісти ${from.id}`, `reply_${from.id}`)]])
                    });
                } else if (msg.document) {
                    await ctx.telegram.sendDocument(adminId, msg.document.file_id, {
                        caption: `📩 <b>Підтримка</b>\n\n${senderInfo}`,
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([[Markup.button.callback(`📨 Відповісти ${from.id}`, `reply_${from.id}`)]])
                    });
                } else if (msg.video) {
                    await ctx.telegram.sendVideo(adminId, msg.video.file_id, {
                        caption: `📩 <b>Підтримка</b>\n\n${senderInfo}`,
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([[Markup.button.callback(`📨 Відповісти ${from.id}`, `reply_${from.id}`)]])
                    });
                } else if (msg.text) {
                    await ctx.telegram.sendMessage(adminId,
                        `📩 <b>Підтримка</b>\n\n${senderInfo}\n📝 <i>${msg.text}</i>`, {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([[Markup.button.callback(`📨 Відповісти ${from.id}`, `reply_${from.id}`)]])
                        });
                } else {
                    return ctx.reply('❌ Тип повідомлення не підтримується.');
                }
            } catch (err) {
                console.error('❗ Помилка при надсиланні повідомлення в підтримку:', err.message);
            }

            const dbUser = getUser(ctx.from.id);
            const hasAccess = dbUser?.course;

            await ctx.reply('✅ Повідомлення надіслано! Очікуйте відповідь.', {
                reply_markup: hasAccess
                    ? paidKeyboard()
                    : {
                        keyboard: [
                            ['📂 Розбір кейсів', '🎓 Онлайн Курси'],
                            ['💸 Реферальна програма', '🛟 Підтримка']
                        ],
                        resize_keyboard: true
                    }
            });
            return;
        }

        await next(); // важно!
    });

    bot.action(/^reply_(\d+)$/, async (ctx) => {
        const targetId = ctx.match[1];
        ctx.session.replyTo = targetId;

        await ctx.answerCbQuery();
        await ctx.reply(`✏️ Напишіть відповідь для користувача [${targetId}]:`);
    });
}

module.exports = registerSupportScene;
