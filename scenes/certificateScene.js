const { createCanvas, loadImage, registerFont } = require('canvas');
const { getUser } = require('../helpers/db');
const path = require('path');
const fs = require('fs');

const congratsMessages = require('../messages/congratsMessages');

const { isAdmin } = require('../helpers/admins');

registerFont(path.join(__dirname, '..', 'assets', 'Montserrat-Bold.ttf'), { family: 'Montserrat' });

function registerCertificateScene(bot) {
    bot.action('admin_generate_certificate', async (ctx) => {
        if (!isAdmin(ctx.from.id)) {
            return ctx.answerCbQuery('❌ Немає доступу.', { show_alert: true });
        }

        ctx.session.waiting_for_certificate_id = true;
        await ctx.answerCbQuery();
        await ctx.reply('✍️ Введіть ID користувача для сертифікату:');
    });

    bot.on('text', async (ctx, next) => {
        if (!ctx.session.waiting_for_certificate_id) return next();

        ctx.session.waiting_for_certificate_id = false;
        const userId = Number(ctx.message.text.trim());
        const user = getUser(userId);

        if (!user || !user.name) {
            return ctx.reply('❌ Користувача не знайдено або немає імені.');
        }

        try {
            let certPath;
            if (user.course === 'Базовий') {
                certPath = path.join(__dirname, '..', 'assets', 'certificate_basics_template.png');
            } else if (user.course === 'Елайнери') {
                certPath = path.join(__dirname, '..', 'assets', 'certificate_aligners_template.png');
            } else {
                return ctx.reply('❌ Курс не вказано.');
            }

            if (!fs.existsSync(certPath)) {
                return ctx.reply('❌ Шаблон сертифікату не знайдено.');
            }

            const template = await loadImage(certPath);
            const canvas = createCanvas(template.width, template.height);
            const ctx2d = canvas.getContext('2d');

            ctx2d.drawImage(template, 0, 0);
            ctx2d.textAlign = 'center';
            ctx2d.fillStyle = '#0B1F2A';
            ctx2d.font = 'bold 64px Montserrat';

            const fullName = user.name.toUpperCase();
            ctx2d.fillText(fullName, canvas.width / 2, 650);

            const buffer = canvas.toBuffer('image/png');

            // Надсилаємо адміну
            await ctx.replyWithPhoto({ source: buffer }, { caption: '✅ Сертифікат згенеровано!' });

            // Надсилаємо користувачу (перевіряємо, що не той самий, що й адмін)
            if (ctx.from.id !== userId) {
                try {
                    await ctx.telegram.sendPhoto(userId, { source: buffer }, { caption: '🎓 Ваш сертифікат за курс!' });

                    const congrats = congratsMessages[user.course];
                    if (congrats) {
                        await ctx.telegram.sendMessage(userId, congrats, { parse_mode: 'HTML' });
                    }
                } catch (err) {
                    console.warn(`❗ Не вдалося надіслати сертифікат або вітання користувачу ${userId}: ${err.message}`);
                }
            }

        } catch (error) {
            console.error('❗ Помилка генерації сертифікату:', error.message);
            await ctx.reply('❌ Помилка генерації сертифікату.');
        }
    });
}

module.exports = registerCertificateScene;
