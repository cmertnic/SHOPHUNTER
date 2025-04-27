const fs = require('fs');
const path = require('path');
const { updateI18nextLanguage, i18next } = require('../../i18n');
const { initializeDefaultUserSettings, getUserSettings } = require('../../database/settingsDb');
const userSessions = require('../../userSessions');

module.exports = {
    name: '/language',
    async execute(bot, chatId) {
        const userId = chatId;
        let userSettings = await getUserSettings(userId);

        // Создаем уникальную сессию для пользователя, если она еще не существует
        if (!userSessions[userId]) {
            userSessions[userId] = {
                isProcessing: false,
                currentIndex: 0,
                products: [],
                language: userSettings ? userSettings.language : 'eng',
            };
        }

        const userSession = userSessions[userId];

        if (!userSettings) {
            console.warn(`Настройки пользователя для ID ${userId} не найдены. Инициализируем настройки по умолчанию.`);
            await initializeDefaultUserSettings(userId);
            userSettings = await getUserSettings(userId);
        }

        // Получаем доступные языки из директории locales
        const localesPath = path.join(__dirname, '../../locales');
        const availableLanguages = fs.readdirSync(localesPath).map(file => file.replace('.json', ''));

        const languageButtons = availableLanguages.map(lang => ({
            text: i18next.t(`languages.${lang}`).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\\\$1'),
            callback_data: lang
        }));

        const response = i18next.t('settings.choose_language').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\\\$1');
        const options = {
            reply_markup: {
                keyboard: [
                    [
                        {
                            text: i18next.t('settings.back').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\\\$1')
                        }
                    ]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };

        // Отправляем первое сообщение с обычной клавиатурой
        await bot.sendMessage(chatId, response, { parse_mode: 'MarkdownV2', ...options });

        // Группируем кнопки по три в строке
        const groupedButtons = [];
        for (let i = 0; i < languageButtons.length; i += 3) {
            groupedButtons.push(languageButtons.slice(i, i + 3)); // Берем 3 кнопки за раз
        }

        const keyboard = {
            reply_markup: {
                inline_keyboard: groupedButtons, // Используем сгруппированные кнопки
            },
        };

        // Отправляем второе сообщение с кнопками языков
        await bot.sendMessage(chatId, i18next.t('settings.language').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\\\$1'), keyboard);
    },
};
