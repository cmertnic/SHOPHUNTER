const { updateI18nextLanguage, i18next } = require('../../i18n');
const { getUserSettings } = require('../../database/settingsDb');

// Экспортируем команду /start
module.exports = {
    name: '/start',
    async execute(bot, chatId, userId) {
        try {
            const userSettings = await getUserSettings(userId);
            await updateI18nextLanguage(chatId, userSettings.language || 'rus');

            const welcomeMessage = `
                ${i18next.t('start.welcome.message')} 🎉
                \n${i18next.t('start.welcome.introduction')}
                \n**${i18next.t('start.welcome.main_features')}:**
                \n1. /help - ${i18next.t('start.welcome.help_command')}
                \n2. /settings - ${i18next.t('start.welcome.settings_command')}
            `;
            
            await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`Ошибка при выполнении команды /start: ${error.message}`);
            await bot.sendMessage(chatId, i18next.t('start.error.general'), { parse_mode: 'Markdown' });
        }
    },
};
