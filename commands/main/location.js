const { i18next,updateI18nextLanguage } = require('../../i18n');
const { getUserSettings, initializeDefaultUserSettings } = require('../../database/settingsDb');

module.exports = {
    name: '/location',
    execute: async (bot, chatId, userId) => {
        try {
            await initializeDefaultUserSettings(userId);
            
            const userSettings = await getUserSettings(userId);
            await updateI18nextLanguage(chatId, userSettings.language);

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

            await bot.sendMessage(chatId, promptText, options);
        } catch (error) {
            console.error(`Ошибка при обработке команды /location для пользователя ${userId}: ${error.message}`);
            await bot.sendMessage(chatId, i18next.t('error.initializing_settings'));
        }
    }
};
