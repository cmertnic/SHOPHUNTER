const { updateI18nextLanguage, i18next } = require('../../i18n');
const { getUserSettings } = require('../../database/settingsDb');

module.exports = {
    name: '/start',
    async execute(bot, chatId, userId) {
        try {
            const userSettings = await getUserSettings(userId);
            await updateI18nextLanguage(chatId, userSettings.language || 'eng');

            const welcomeMessage = `
                ${i18next.t('start.welcome.message')} 🎉
                \n${i18next.t('start.welcome.introduction')}
                \n${i18next.t('start.welcome.main_features')}:
                \n1. /search ${i18next.t('start.welcome.search_command_description')}
                \n2. /settings - ${i18next.t('start.welcome.settings_command_description')}
                \n3. /location - ${i18next.t('start.welcome.location_command_description')}
                \n4. /help - ${i18next.t('start.welcome.help_command_description')}
            `;
            const options = {
                reply_markup: {
                    keyboard: [
                        [
                            {
                                text: i18next.t('start.welcome.settings_command'),
                            }
                        ],
                        [
                            {
                                text: i18next.t('start.welcome.location_command')
                            }
                        ],
                        [
                            {
                                text: i18next.t('start.welcome.search_command')
                            }
                        ],
                        [
                            {
                                text: i18next.t('start.welcome.help_command')
                            }
                        ],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            };


            await bot.sendMessage(chatId, welcomeMessage, options, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error(`Ошибка при выполнении команды /start: ${error.message}`);
            await bot.sendMessage(chatId, i18next.t('start.error.general'), { parse_mode: 'Markdown' });
        }
    },
};
