const { updateI18nextLanguage, i18next } = require('../../i18n');
const { initializeDefaultUserSettings, getUserSettings, updateUserSettings } = require('../../database/settingsDb');
const { handleTextMessage } = require('../../events');

module.exports = {
    name: '/settings',
    async execute(bot, chatId) {
        const userId = chatId; // Используем chatId как userId
        let userSettings = await getUserSettings(userId);

        if (!userSettings) {
            console.warn(`Настройки пользователя для ID ${userId} не найдены. Инициализируем настройки по умолчанию.`);
            await initializeDefaultUserSettings(userId);
            userSettings = await getUserSettings(userId);
        }

        await updateI18nextLanguage(chatId, userSettings.language || 'rus');

        // Извлечение местоположения
        const location = userSettings.location ? userSettings.location : i18next.t('settings.not_set');

        const response = `
        ${i18next.t('settings.current_settings')}:
        \n${i18next.t('settings.language')}: ${userSettings.language || i18next.t('settings.not_set')}
        \n${i18next.t('settings.coordinate')}: ${location}
        \n${i18next.t('settings.choose_option')}
      `;

        const keyboard = {
            reply_markup: {
                keyboard: [
                    [
                        { text: i18next.t('settings.change_language') }, // Кнопка для изменения языка
                    ],
                    [
                        { text: i18next.t('settings.back') }, // Кнопка "Назад"
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        };

        // Отправляем сообщение с текущими настройками
        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown', ...keyboard });
    },
};
