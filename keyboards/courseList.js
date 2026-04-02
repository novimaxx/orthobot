const { Markup } = require('telegraf');

module.exports = () =>
    Markup.inlineKeyboard([
        [Markup.button.callback('📘 Базовий', 'course_Базовий')],
        [Markup.button.callback('🦷 Елайнери', 'course_Елайнери')],
        [Markup.button.callback('🧠 Pro', 'course_Pro')]
    ]);

