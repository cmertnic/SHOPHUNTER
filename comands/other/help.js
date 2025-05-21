const { updateI18nextLanguage, i18next } = require('../../i18n');
const { getUserSettings } = require('../../database/settingsDb');
module.exports = {
    name: '/help',
    async execute(bot, chatId, userId) {
        const userSettings = await getUserSettings(userId);
        await updateI18nextLanguage(chatId, userSettings.language);

        const response = 
        `
        - /settings: ${i18next.t('help.settings_description')}
        - /location: ${i18next.t('help.location_description')}
        - /search: ${i18next.t('help.search_description')}
        - /start: ${i18next.t('help.start_description')}
        - /help: ${i18next.t('help.help_description')}
        
${i18next.t('help.contact_info')}

        ${i18next.t('help.contact_info_text')}

       
        `;

        const keyboard = {
            reply_markup: {
                keyboard: [
                    [
                        { text: i18next.t('settings.back') },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        };

        await bot.sendMessage(chatId, response, { parse_mode: 'Markdown', ...keyboard });
    },
};
