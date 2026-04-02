const { Markup } = require('telegraf');
const { saveUserField, getUser, setCourse } = require('../helpers/db');
const { saveReferralCode, tryGiveBonus, getReferralStats } = require('../helpers/referrals');

const courseDescriptions = require('../messages/courseDescriptions');
const referralProgramMessage = require('../messages/referralProgram');
const referralStatsMessage = require('../messages/referralStats');
const formQuestions = require('../messages/formQuestions');
const profileEditor = require('../keyboards/profileEditor');
const courseList = require('../keyboards/courseList');
const { appendUser } = require('../helpers/googleSheet');
const paidKeyboard = require('../keyboards/paidKeyboard');
const { createInvoice } = require('../helpers/cryptoBot');


const TON_ADDRESS = 'UQC5XufXgi0cDm_Pl3RknzgjqdDUIs8J0jOeEr90d1teloy2';
const getTonLink = (amount) => `https://t.me/wallet?startapp=transfer_ton-${TON_ADDRESS}-${amount}`;

const coursePaymentLinks = {
    'Базовий': 'https://secure.wayforpay.com/button/b1f0015ac7193',
    'Елайнери': 'https://secure.wayforpay.com/button/b2651049368d0',
    'Pro': 'https://secure.wayforpay.com/button/b60a182a4a627'
};

const prices = {
    'Базовий': '30000 UAH / 720 USDT',
    'Елайнери': '25000 UAH / 600 USDT',
    'Pro': '20000 UAH / 500 USDT'
};

async function startProfileFilling(ctx, userId) {
    saveUserField(userId, 'step', 'name');
    await ctx.telegram.sendMessage(userId, `📝 Для доступу до курсу заповніть анкету.\n\n${formQuestions.name}`, {
        parse_mode: 'HTML'
    });
}

function registerCourseScene(bot) {
    const usdtPrices = {
        'Базовий': 720,
        'Елайнери': 600,
        'Pro': 500 //
    };

    const fields = {
        edit_name: 'name',
        edit_email: 'email',
        edit_phone: 'phone',
        edit_city: 'city',
        edit_education: 'education',
        edit_position: 'position',
        edit_job: 'job',
        edit_birth: 'birth'
    };

    bot.hears('💸 Реферальна програма', async (ctx) => {
        const userId = ctx.from.id;
        const code = saveReferralCode(userId);
        const link = `https://t.me/${ctx.botInfo.username}?start=${code}`;

        await ctx.replyWithHTML(referralProgramMessage(link), Markup.inlineKeyboard([
            [Markup.button.callback('📊 Моя статистика', 'ref_stats')],
            [Markup.button.callback('💳 Вивести кешбек', 'withdraw_cashback')]
        ]));
    });

    bot.action('ref_stats', async (ctx) => {
        const stats = getReferralStats(ctx.from.id);
        await ctx.answerCbQuery();
        await ctx.reply(referralStatsMessage(stats), { parse_mode: 'HTML' });
    });

    const pendingWithdrawals = {};

// 💳 Вивести кешбек
    bot.action('withdraw_cashback', async (ctx) => {
        const userId = ctx.from.id;
        const username = ctx.from.username ? `@${ctx.from.username}` : 'немає';
        const firstName = ctx.from.first_name || 'Без імені';

        const { getReferralStats } = require('../helpers/referrals');
        const stats = getReferralStats(userId);

        const cashback = stats.cashbackUsd || 0;
        const adminId = Number(process.env.ADMIN_ID);

        await ctx.reply('🏦 Ви подали заявку на виведення кешбеку! Очікуйте підтвердження.');

        await ctx.telegram.sendMessage(adminId,
            `📤 <b>Нова заявка на виведення кешбеку!</b>\n\n👤 ${firstName} (${username})\n🆔 ID: <code>${userId}</code>\n💰 Сума кешбеку: <b>${cashback} USDT</b>`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(`✅ Підтвердити виплату для ${userId}`, `approve_cashout_${userId}`),
                        Markup.button.callback(`🚫 Відхилити`, `reject_cashout_${userId}`)
                    ]
                ])
            });
        await ctx.answerCbQuery();
    });

// ✅ Підтвердити виплату
    bot.action(/^approve_cashout_(\d+)$/, async (ctx) => {
        const userId = ctx.match[1];
        const adminId = ctx.from.id;

        pendingWithdrawals[adminId] = userId;

        await ctx.reply(`✉️ Надішліть чек через @CryptoBot для користувача: <code>${userId}</code>.`, { parse_mode: 'HTML' });
        await ctx.answerCbQuery('✅ Очікуємо чек.');
    });

// 🚫 Відхилити заявку
    bot.action(/^reject_cashout_(\d+)$/, async (ctx) => {
        const userId = ctx.match[1];

        await ctx.telegram.sendMessage(userId, `❌ Вашу заявку на виведення кешбеку було відхилено.`, { parse_mode: 'HTML' });
        await ctx.answerCbQuery('🚫 Виплату відхилено.');
    });

    bot.hears('🎓 Онлайн Курси', async (ctx) => {
        await ctx.reply(
            `<b>«Онлайн курси»</b>\n\nОнлайн-навчання без обмежень 🧠\n\nТут зібрані всі доступні онлайн-курси від <b>OrthoSchool</b>. Навчайся у зручний час, у власному темпі.\n\n🔻 Обери курс:`,
            { parse_mode: 'HTML', disable_web_page_preview: true, ...courseList() }
        );
    });

    Object.keys(courseDescriptions).forEach((courseName) => {
        bot.action(`course_${courseName}`, async (ctx) => {
            const description = courseDescriptions[courseName];
            await ctx.answerCbQuery();
            await ctx.reply(
                `<b>${courseName}</b>\n\n${description}`,
                {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('💳 Оплатити', `pay_${courseName}`)]
                    ])
                }
            );
        });
    });

    bot.action(/^pay_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        const courseName = ctx.match[1];

        const price = prices[courseName];
        const paymentUrl = coursePaymentLinks[courseName];
        const usdtAmount = usdtPrices[courseName];

        await setCourse(userId, courseName);

        let cryptoLink;
        try {
            cryptoLink = await createInvoice(usdtAmount, userId);
        } catch (error) {
            console.error('❗ Не вдалося створити інвойс у CryptoBot:', error.message);
            cryptoLink = null;
        }

        let text = `✅ <b>Курс обрано!</b>

<b>Прайс:</b> ${price}

<b>Також доступна оплата частинами!</b>

<b>Оберіть зручний спосіб оплати:</b>
• <a href="${paymentUrl}">Карткою (WayForPay)</a>`;

        if (cryptoLink) {
            text += `\n• <a href="${cryptoLink}">Оплата через CryptoBot (USDT)</a>`;
        }

        text += `

<b>Або за банківськими реквізитами:</b>
🏦 <b>ФОП Штунь Денис Олександрович</b>
IBAN: <code>UA273220010000026005330147569</code>
ІПН/ЄДРПОУ: <code>3543105355</code>
Банк: Акціонерне товариство УНІВЕРСАЛ БАНК
МФО: <code>322001</code>
ОКПО Банку: <code>21133352</code>

📋 <i>В призначенні платежу вкажіть: «Онлайн-навчання»</i>

🧾 <b>Після оплати обов’язково надішліть фото квитанції</b> за допомогою кнопки нижче 👇`;

        await ctx.reply(text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📸 Надіслати квитанцію', `confirm_screenshot_${courseName}`)]
            ])
        });
    });

    bot.action(/^confirm_screenshot_(.+)$/, async (ctx) => {
        const course = ctx.match[1];
        const userId = ctx.from.id;

        saveUserField(userId, 'awaiting_payment', course);
        await ctx.answerCbQuery();
        await ctx.reply(
            `✅ Чудово! Тепер надішліть скріншот чека сюди в бот 📎`,
            { parse_mode: 'HTML' }
        );
    });

    bot.on('text', async (ctx, next) => {
        const userId = ctx.from.id;
        const user = getUser(userId);
        const value = ctx.message.text.trim();

        if (value === '/profile' || value === '👤 Профіль') {
            if (!user || !user.created_at) {
                return ctx.reply('❌ Ви ще не заповнювали анкету.');
            }

            const premiumStatus = user.is_premium ? '⭐️ Premium' : '';

            const profile = `👤 <b>Профіль</b>\n\n<b>Ім’я:</b> ${user.name || '—'}
<b>Email:</b> ${user.email || '—'}
<b>Телефон:</b> ${user.phone || '—'}

<b>Освіта:</b> ${user.education || '—'}
<b>Місто:</b> ${user.city || '—'}
<b>Дата нар.:</b> ${user.birth || '—'}

<b>Робота:</b> ${user.job || '—'}
<b>Посада:</b> ${user.position || '—'}

<b>Курс:</b> 📘 ${user.course || '—'}
<b>Статус:</b> ${premiumStatus}


<b>Заповнено:</b> ${new Date(user.created_at).toLocaleString('uk-UA')}`;

            return ctx.reply(profile, {
                parse_mode: 'HTML',
                ...profileEditor()
            });
        }

        if (!user || !user.step) return next();

        if (user.created_at) {
            saveUserField(userId, user.step, value);
            saveUserField(userId, 'step', null);
            return ctx.reply(formQuestions.saved);
        }

        const steps = ['name', 'email', 'phone', 'education', 'city', 'birth', 'job', 'position'];
        const nextStep = steps[steps.indexOf(user.step) + 1];

        saveUserField(userId, user.step, value);
        if (nextStep) {
            saveUserField(userId, 'step', nextStep);
            return ctx.reply(formQuestions[nextStep], { parse_mode: 'HTML' });
        }

        // Останній крок
        saveUserField(userId, 'created_at', new Date().toISOString());
        saveUserField(userId, 'step', null);

        await appendUser(getUser(userId));

        const inviterId = tryGiveBonus(userId);
        if (inviterId) {
            try {
                await ctx.telegram.sendMessage(inviterId, '🎉 Ваш реферал заповнив анкету! Ви отримали 5% кешбеку 🤑');
            } catch (err) {
                console.error('❗ Не вдалося надіслати повідомлення пригласившему:', err.message);
            }
        }

        await ctx.reply('✅ Анкету збережено! Тепер ви маєте повний доступ до курсу.', {
            parse_mode: 'HTML',
            reply_markup: paidKeyboard()
        });
    });

    bot.action('back_to_profile', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.deleteMessage().catch(() => {});
        await ctx.reply(
            '📋 <b>Головне меню</b>\nОберіть одну з опцій нижче:',
            {
                parse_mode: 'HTML',
                reply_markup: paidKeyboard()
            }
        );
    });

    bot.action('open_profile_edit', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.reply('🔧 Що саме бажаєте змінити?', {
            reply_markup: {
                inline_keyboard: [
                    [Markup.button.callback('✏️ Ім’я', 'edit_name'), Markup.button.callback('📧 Email', 'edit_email')],
                    [Markup.button.callback('📱 Телефон', 'edit_phone'), Markup.button.callback('🏙️ Місто', 'edit_city')],
                    [Markup.button.callback('🎓 Освіта', 'edit_education'), Markup.button.callback('💼 Посада', 'edit_position')],
                    [Markup.button.callback('🏥 Робота', 'edit_job'), Markup.button.callback('🎂 Дата нар.', 'edit_birth')],
                    [Markup.button.callback('↩️ Назад', 'back_to_profile')]
                ]
            },
            parse_mode: 'HTML'
        });
    });

    Object.entries(fields).forEach(([action, field]) => {
        bot.action(action, async (ctx) => {
            const userId = ctx.from.id;
            saveUserField(userId, 'step', field);
            await ctx.answerCbQuery();
            await ctx.reply(`✏️ Введіть нове <b>${field}</b>:`, { parse_mode: 'HTML' });
        });
    });

    bot.on('photo', (ctx, next) => next());
    bot.on('text', (ctx, next) => next());

    const { getUserCourses } = require('../helpers/db');

    bot.hears('📚 Мої курси', async (ctx) => {
        const userId = ctx.from.id;
        const userCourses = getUserCourses(userId);

        if (!userCourses.length) {
            return ctx.reply('❌ У вас немає активних курсів.');
        }

        await ctx.reply('📚 Ваші активні курси:', {
            reply_markup: {
                inline_keyboard: userCourses.map(course => [
                    Markup.button.callback(course.course_name, `open_course_${course.course_name}`)
                ])
            }
        });
    });

    bot.action(/^open_course_(.+)$/, async (ctx) => {
        const selectedCourseName = ctx.match[1];
        const courses = require('../lessons');
        const lessons = courses[selectedCourseName];

        if (!lessons) {
            return ctx.reply('⚠️ Курс не знайдено.');
        }

        const userId = ctx.from.id;
        const userCourses = getUserCourses(userId);
        const course = userCourses.find(c => c.course_name === selectedCourseName);

        if (!course) {
            return ctx.reply('❌ Ви не маєте доступу до цього курсу.');
        }

        const startDate = new Date(course.started_at);
        const now = new Date();
        const daysPassed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

        const availableLessons = lessons.filter(lesson => daysPassed >= lesson.delay);

        if (availableLessons.length === 0) {
            return ctx.reply('📚 Уроки ще недоступні. Очікуйте!');
        }

        for (const lesson of availableLessons) {
    // Заменим <br> и <br/> на перенос строки
    const safeText = lesson.text.replace(/<br\s*\/?>/gi, '\n');

    let message = `✨ <b>${lesson.title}</b>\n\n${safeText}`;

    if (lesson.video) {
        message += `\n\n▶️ <a href="${lesson.video}">Переглянути</a>`;
    }

    await ctx.replyWithHTML(message);
}

await ctx.answerCbQuery();
    });

    bot.action('start_profile_form', async (ctx) => {
        const userId = ctx.from.id;
        await startProfileFilling(ctx, userId);
    });

    bot.on('message', async (ctx, next) => {
        const adminId = ctx.from.id;
        const userId = pendingWithdrawals[adminId];

        if (userId) {
            try {
                await ctx.forwardMessage(userId);
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

    bot.action('request_cashback', async (ctx) => {
        const userId = ctx.from.id;
        const username = ctx.from.username ? `@${ctx.from.username}` : 'немає';
        const firstName = ctx.from.first_name || 'Без імені';

        const adminId = Number(process.env.ADMIN_ID);
        await ctx.reply('🏦 Ваш запит на кешбек за розбір кейсів надіслано адміністратору!');

        await ctx.telegram.sendMessage(adminId,
            `📤 <b>Нова заявка на кешбек за розбір кейсів!</b>\n\n👤 ${firstName} (${username})\n🆔 ID: <code>${userId}</code>`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(`✅ Підтвердити виплату для ${userId}`, `approve_cashback_${userId}`),
                        Markup.button.callback(`🚫 Відхилити`, `reject_cashback_${userId}`)
                    ]
                ])
            });
        await ctx.answerCbQuery();
    });

}

module.exports = registerCourseScene;
