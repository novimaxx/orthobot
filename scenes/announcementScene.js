const { addAnnouncement, getLastAnnouncements, deleteAnnouncement, getAllUsers, saveUserField } = require('../helpers/db');
const { Markup } = require('telegraf');

const pendingWithdrawals = {};

const adminId = Number(process.env.ADMIN_ID);

function registerAnnouncementScene(bot) {
    bot.command('admin', async (ctx) => {
        if (ctx.from.id !== adminId) return;
        await ctx.reply('🛠 Адмін-панель:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Додати анонс', callback_data: 'admin_add_announcement' }],
                    [{ text: '🗑 Видалити анонс', callback_data: 'admin_delete_announcement' }],
                    [{ text: '📤 Розіслати повідомлення', callback_data: 'admin_broadcast' }],
                    [{ text: '📜 Згенерувати сертифікат', callback_data: 'admin_generate_certificate' }]
                ]
            }
        });
    });

    bot.action('admin_add_announcement', async (ctx) => {
        if (ctx.from.id !== adminId) return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });
        ctx.session.waiting_announcement = true;
        await ctx.answerCbQuery();
        await ctx.reply('📝 Надішліть текст/фото для анонсу:');
    });

    bot.action('admin_delete_announcement', async (ctx) => {
        if (ctx.from.id !== adminId) return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });

        const announcements = getLastAnnouncements(5);
        if (announcements.length === 0) {
            return ctx.reply('ℹ️ Немає анонсів для видалення.');
        }

        const buttons = announcements.map(ann => [
            Markup.button.callback(`🗑 Видалити: ${ann.content.slice(0, 20)}...`, `delete_ann_${ann.id}`)
        ]);

        await ctx.reply('🗑 Виберіть анонс для видалення:', { reply_markup: { inline_keyboard: buttons } });
        await ctx.answerCbQuery();
    });

    bot.action(/^delete_ann_(\d+)$/, async (ctx) => {
        if (ctx.from.id !== adminId) return;
        const id = Number(ctx.match[1]);
        deleteAnnouncement(id);
        await ctx.answerCbQuery('✅ Анонс видалено!');
    });

    bot.action('admin_broadcast', async (ctx) => {
        if (ctx.from.id !== adminId) return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });

        ctx.session.waiting_broadcast = true;
        await ctx.reply('📝 Надішліть повідомлення для розсилки всім користувачам:');
        await ctx.answerCbQuery();
    });

    // Приём анонсів
    bot.on(['text', 'photo', 'video', 'document'], async (ctx, next) => {
        if (ctx.session?.waiting_broadcast) {
            if (ctx.from.id !== adminId) return;

            const users = getAllUsers();
            let success = 0;

            for (const user of users) {
                try {
                    if (ctx.message.text) {
                        await ctx.telegram.sendMessage(user.id, ctx.message.text);
                    } else if (ctx.message.photo) {
                        await ctx.telegram.sendPhoto(user.id, ctx.message.photo.at(-1).file_id, { caption: ctx.message.caption || '' });
                    } else if (ctx.message.video) {
                        await ctx.telegram.sendVideo(user.id, ctx.message.video.file_id, { caption: ctx.message.caption || '' });
                    } else if (ctx.message.document) {
                        await ctx.telegram.sendDocument(user.id, ctx.message.document.file_id, { caption: ctx.message.caption || '' });
                    }
                    success++;
                } catch (error) {
                    console.warn(`⚠️ Не вдалося надіслати ${user.id}:`, error.message);
                }
            }

            ctx.session.waiting_broadcast = false;
            return ctx.reply(`✅ Розсилку завершено! Успішно надіслано ${success} користувачам.`);
        }

        if (ctx.session?.waiting_announcement) {
            if (ctx.from.id !== adminId) return;

            const msg = ctx.message;
            const content = msg.caption || msg.text || '[Без тексту]';

            let type = null;
            let file_id = null;

            if (msg.photo) {
                type = 'photo';
                file_id = msg.photo.at(-1).file_id;
            } else if (msg.video) {
                type = 'video';
                file_id = msg.video.file_id;
            } else if (msg.document) {
                type = 'document';
                file_id = msg.document.file_id;
            }

            await addAnnouncement({ content, type, file_id }); // функция в твоей db-хелпере

            ctx.session.waiting_announcement = false;
            return ctx.reply('✅ Анонс успішно додано!');
        }

        return next();
    });

    bot.hears('📢 Анонси', async (ctx) => {
        const announcements = getLastAnnouncements(5);

        if (!announcements.length) {
            return ctx.reply('ℹ️ Наразі немає доступних анонсів.');
        }

        for (const ann of announcements) {
            if (ann.type === 'photo') {
                await ctx.replyWithPhoto(ann.file_id, {
                    caption: ann.content,
                    parse_mode: 'HTML'
                });
            } else if (ann.type === 'video') {
                await ctx.replyWithVideo(ann.file_id, {
                    caption: ann.content,
                    parse_mode: 'HTML'
                });
            } else if (ann.type === 'document') {
                await ctx.replyWithDocument(ann.file_id, {
                    caption: ann.content,
                    parse_mode: 'HTML'
                });
            } else {
                await ctx.reply(`📢 <b>Анонс:</b>\n\n${ann.content}`, {
                    parse_mode: 'HTML'
                });
            }
        }
    });

    bot.action(/^approve_cashback_(\d+)$/, async (ctx) => {
        const userId = ctx.match[1];
        const adminId = ctx.from.id;

        // Сохраняем информацию о том, что админ подтвердил выплату
        pendingWithdrawals[adminId] = userId;

        await ctx.reply(`✉️ Надішліть чек через @CryptoBot для користувача: <code>${userId}</code>.`, { parse_mode: 'HTML' });
        await ctx.answerCbQuery('✅ Очікуємо чек.');
    });

// Когда админ отправляет чек
    bot.on('message', async (ctx, next) => {
        const adminId = ctx.from.id;
        const userId = pendingWithdrawals[adminId];

        if (userId) {
            try {
                await ctx.forwardMessage(userId);
                saveUserField(userId, 'is_premium', 1); // добавляем premium!
                await ctx.reply('✅ Чек успішно надіслано користувачу!');
            } catch (err) {
                console.error('❗ Помилка при надсиланні чека:', err.message);
                await ctx.reply('⚠️ Помилка при надсиланні чека.');
            }

            delete pendingWithdrawals[adminId];
            return;
        }

        await next(); // <-- Обязательно продолжаем цепочку, если не наш случай
    });
}

module.exports = registerAnnouncementScene;
