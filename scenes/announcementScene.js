const { addAnnouncement, getLastAnnouncements, deleteAnnouncement, getAllUsers, saveUserField, getUtmStats } = require('../helpers/db');
const { Markup } = require('telegraf');

const pendingWithdrawals = {};

const { isAdmin, canViewStats } = require('../helpers/admins');

function registerAnnouncementScene(bot) {
    bot.command('admin', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return;
        await ctx.reply('🛠 Адмін-панель:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Додати анонс', callback_data: 'admin_add_announcement' }],
                    [{ text: '🗑 Видалити анонс', callback_data: 'admin_delete_announcement' }],
                    [{ text: '📤 Розіслати повідомлення', callback_data: 'admin_broadcast' }],
                    [{ text: '📜 Згенерувати сертифікат', callback_data: 'admin_generate_certificate' }],
                    [{ text: '📊 UTM статистика', callback_data: 'admin_utm_stats' }]
                ]
            }
        });
    });

    // UTM статистика — доступна через кнопку и команду /stats
    async function sendUtmStats(ctx) {
        const stats = getUtmStats();

        if (stats.total === 0) {
            return ctx.reply('📊 Поки що немає даних по UTM.');
        }

        let text = `📊 <b>UTM Статистика</b>\n\n`;
        text += `👥 Всього з реклами: <b>${stats.total}</b>\n\n`;

        text += `<b>По джерелах:</b>\n`;
        for (const row of stats.bySource) {
            text += `• <b>${row.utm_source || 'невідомо'}</b>: ${row.users} прийшло / ${row.paid} оплатило\n`;
        }

        if (stats.byCampaign.length > 0) {
            text += `\n<b>По кампаніях:</b>\n`;
            for (const row of stats.byCampaign) {
                text += `• <b>${row.utm_source}/${row.utm_campaign}</b>: ${row.users} прийшло / ${row.paid} оплатило\n`;
            }
        }

        await ctx.reply(text, { parse_mode: 'HTML' });
    }

    bot.action('admin_utm_stats', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });
        await ctx.answerCbQuery();
        await sendUtmStats(ctx);
    });

    bot.command('stats', async (ctx) => {
        if (!canViewStats(ctx.from.id)) return;
        await sendUtmStats(ctx);
    });

    bot.action('admin_add_announcement', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });
        ctx.session.waiting_announcement = true;
        await ctx.answerCbQuery();
        await ctx.reply('📝 Надішліть текст/фото для анонсу:');
    });

    bot.action('admin_delete_announcement', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });

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
        if (!isAdmin(ctx.from.id)) return;
        const id = Number(ctx.match[1]);
        deleteAnnouncement(id);
        await ctx.answerCbQuery('✅ Анонс видалено!');
    });

    bot.action('admin_broadcast', async (ctx) => {
        if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });

        ctx.session.waiting_broadcast = true;
        await ctx.reply('📝 Надішліть повідомлення для розсилки всім користувачам:');
        await ctx.answerCbQuery();
    });

    // Приём анонсів
    bot.on(['text', 'photo', 'video', 'document'], async (ctx, next) => {
        if (ctx.session?.waiting_broadcast) {
            if (!isAdmin(ctx.from.id)) return;

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
            if (!isAdmin(ctx.from.id)) return;

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
