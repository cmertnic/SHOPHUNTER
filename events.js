const { updateI18nextLanguage, i18next } = require('./i18n');
const { getUserSettings, updateUserSettings } = require('./database/settingsDb');

async function handleTextMessage(bot, chatId, messageText) {
    if (messageText === i18next.t('settings.change_language')) {
        // Здесь вызываем команду смены языка
        await changeLanguage(bot, chatId);
    } else if (messageText === i18next.t('settings.back')) {
        // Обработка кнопки "Назад" - возвращаем к команде /start
        await bot.sendMessage(chatId, i18next.t('start.welcome_message'), { parse_mode: 'Markdown' });
        // Здесь можно вызвать команду /start, если у вас есть отдельная функция для этого
        await bot.sendMessage(chatId, i18next.t('start.menu_options'), { parse_mode: 'Markdown' });
    }
}

async function changeLanguage(bot, chatId) {
    try {
        const userId = chatId;
        let userSettings = await getUserSettings(userId);
        let newLanguage = userSettings.language === 'rus' ? 'eng' : 'rus';

        // Обновляем настройки пользователя
        await updateUserSettings(userId, { language: newLanguage });

        // Обновляем язык в i18next
        await updateI18nextLanguage(chatId, newLanguage);

        // Отправляем сообщение о смене языка
        const languageChangedMessage = i18next.t('settings.language_changed', { language: newLanguage });
        await bot.sendMessage(chatId, languageChangedMessage, { parse_mode: 'Markdown' });

        // Обновляем настройки и повторно отправляем сообщение с текущими настройками
        // Здесь вы можете вызвать метод для обновления настроек, если он доступен
    } catch (error) {
        console.error(`Ошибка при изменении языка: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.general'), { parse_mode: 'Markdown' });
    }
}

// Экспортируем функции
module.exports = {
    handleTextMessage,
    changeLanguage
};
