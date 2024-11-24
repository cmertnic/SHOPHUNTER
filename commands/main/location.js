const { i18next, initializeI18next, updateI18nextLanguage } = require('../../i18n'); // Убедитесь, что путь к i18n корректен
const { updateUserLocation, getUserSettings, saveUserSettings, initializeDefaultUserSettings } = require('../../database/settingsDb');

module.exports = {
    name: '/location',
    execute: async (bot, chatId, userId) => {
        try {
            // Инициализируем настройки пользователя по умолчанию
            await initializeDefaultUserSettings(userId);
            
            // Получаем настройки пользователя, чтобы определить текущий язык
            const userSettings = await getUserSettings(userId);
            await updateI18nextLanguage(chatId, userSettings.language); // Устанавливаем язык

            const promptKey = 'location.prompt';

            const promptText = i18next.t(promptKey);

            const options = {
                reply_markup: {
                    keyboard: [
                        [
                            {
                                text: i18next.t('location.send_location'),
                                request_location: true
                            }
                        ],
                        [
                            {
                                text: i18next.t('location.enter_location_manually')
                            }
                        ],
                        [
                            {
                                text: i18next.t('settings.back')
                            }
                        ]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            };

            // Отправляем сообщение с текстом и клавиатурой
            await bot.sendMessage(chatId, promptText, options);
        } catch (error) {
            console.error(`Ошибка при обработке команды /location для пользователя ${userId}: ${error.message}`);
            await bot.sendMessage(chatId, i18next.t('error.initializing_settings'));
        }
    }
};
