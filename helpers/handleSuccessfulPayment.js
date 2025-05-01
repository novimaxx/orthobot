const { addUserCourse, saveUserField, getUser } = require('./db');
const { appendUser } = require('./googleSheet');
const { tryGiveBonus } = require('./referrals');
const paidKeyboard = require('../keyboards/paidKeyboard');
const { Markup } = require('telegraf');

async function handleSuccessfulPayment(bot, userId, courseName) {
    addUserCourse(userId, courseName);
    saveUserField(userId, 'awaiting_payment', null);

    const user = getUser(userId);
    if (user) {
        try {
            await appendUser(user);
            console.log('📤 Анкета додана до Google Sheet після оплати');
        } catch (err) {
            console.error('❌ Помилка при записі анкети після оплати:', err.message);
        }
    }

    const bonus = tryGiveBonus(userId, courseName);
    if (bonus) {
        try {
            await bot.telegram.sendMessage(bonus.inviterId,
                `🎉 Ваш реферал оплатив курс "${courseName}"! Ви отримали ${bonus.bonusAmount} USDT кешбеку 🤑`
            );
        } catch (err) {
            if (err.code === 400) {
                console.warn('⚠️ Не вдалося надіслати повідомлення пригласившому (chat not found). Ігноруємо.');
            } else {
                console.error('❗ Інша помилка при надсиланні бонусу:', err.message);
            }
        }
    }

    await bot.telegram.sendMessage(userId, `🎉 Оплату підтверджено! Доступ до курсу "${courseName}" відкрито ✅

📋 <b>Щоб отримати повний доступ до навчання, будь ласка, заповніть коротку анкету:</b>`, {
        parse_mode: 'HTML',
        ...paidKeyboard(),
        reply_markup: {
            ...paidKeyboard().reply_markup,
            inline_keyboard: [
                [Markup.button.callback('📝 Заповнити анкету', 'start_profile_form')]
            ]
        }
    });
}

module.exports = { handleSuccessfulPayment };
