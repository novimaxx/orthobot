const { Markup } = require('telegraf');

module.exports = () => {
    return Markup.inlineKeyboard([
        [Markup.button.callback('💸 Кешбек за розбір кейсів', 'request_cashback')],  // Добавлена кнопка
        [Markup.button.callback('✏️ Редагувати анкету', 'open_profile_edit')],
        [Markup.button.callback('↩️ Назад', 'back_to_profile')]
    ]);
};