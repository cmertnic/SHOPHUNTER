require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { initializeI18next, updateI18nextLanguage, i18next } = require('./i18n');
const { getUserSettings, saveUserSettings, initializeDefaultUserSettings, updateUserLocation } = require('./database/settingsDb');
const { handleTextMessage, changeLanguage, sendMainMenu, handleManualLocationInput, sendProductCard, parsePrice, updateProductCard } = require('./events');
const userSessions = require('./userSessions');
const token = process.env.TOKEN;
if (!token) {
    console.error('Токен бота не найден. Убедитесь, что переменная TOKEN установлена в .env файле.');
    process.exit(1);
}
const bot = new TelegramBot(token, { polling: true });
console.log('ShopHunter готов к работе');
const comands = {};
const commandFolders = fs.readdirSync(path.join(__dirname, 'comands'));

for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(path.join(__dirname, 'comands', folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(__dirname, 'comands', folder, file));
        if ('name' in command && 'execute' in command) {
            comands[command.name] = command;
            console.log(`Команда ${command.name} загружена из папки ${folder}.`);
        } else {
            console.log(`Предупреждение! Команда по пути ./comands/${folder}/${file} потеряла свойство "name" или "execute".`);
        }
    }
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);
});

bot.on('polling_error', (error) => {
    console.error(`Ошибка при работе с ботом: ${error.message}`);
});

// Обработка текстовых сообщений
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageText = msg.text;

    try {

        if (messageText === i18next.t('settings.change_language')) {
            await comands['/language'].execute(bot, chatId);
        } else if (messageText === i18next.t('start.welcome.settings_command')) {
            await comands['/settings'].execute(bot, chatId);
        } else if (messageText === i18next.t('start.welcome.help_command')) {
            await comands['/help'].execute(bot, chatId);
        } else if (messageText === i18next.t('start.welcome.search_command')) {
            await comands['/search'].execute(bot, chatId);
        } else if (messageText === i18next.t('start.welcome.location_command')) {
            await comands['/location'].execute(bot, chatId, userId);
        } else if (messageText === i18next.t('settings.back')) {
            await comands['/start'].execute(bot, chatId);
        } else if (messageText === i18next.t('location.enter_location_manually')) {
            await bot.sendMessage(chatId, i18next.t('location.enter_location'));
        } else {
            const locationRegex = /^([а-яА-ЯёЁ\w\s]+),\s*([а-яА-ЯёЁ\w\s]+)(?:,\s*(.*))?$/;
            const match = messageText.match(locationRegex);

            if (match) {
                await handleManualLocationInput(bot, msg, chatId, userId, messageText);
            } else {
                if (messageText) {
                    await handleTextMessage(bot, chatId, messageText);
                } else {
                    console.error('messageText is undefined');
                }
            }
        }
    } catch (error) {
        console.error(`Ошибка при обработке текстового сообщения: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
});

// Обработка callback_query
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    // Проверка на существование сессии
    if (!userSessions[userId]) {
        console.warn(`Сессия пользователя не найдена для userId: ${userId}. Создаем новую сессию.`);
        const userSettings = await getUserSettings(userId);
        userSessions[userId] = {
            isProcessing: false,
            currentIndex: 0,
            products: [],
            language: userSettings ? userSettings.language : 'eng',
        };
    }

    const userSession = userSessions[userId];

    if (userSession.isProcessing) {
        console.warn(`Пользователь ${userId} уже обрабатывает запрос.`);
        return;
    }
    userSession.isProcessing = true;

    try {
        await bot.answerCallbackQuery(query.id);

        // Получение доступных языков из директории locales
        const localesPath = path.join(__dirname, './locales');
        const availableLanguages = fs.readdirSync(localesPath).map(file => file.replace('.json', ''));

        // Проверка, является ли нажатая кнопка выбором языка
        if (availableLanguages.includes(query.data)) {
            if (userSession.language === query.data) {
                console.log(`Настройки пользователя ${userId} не изменились. Сохранение не требуется.`);
            } else {
                console.log(`Смена языка на: ${query.data}`);
                userSession.language = query.data;
                await changeLanguage(bot, chatId, query.data);
                await comands['/language'].execute(bot, chatId);
            }
            return;
        }

        // Обработка навигации по продуктам (предыдущий, следующий и сортировка)
        if (userSession.products.length > 0) {
            switch (query.data) {
                case 'prev':
                    if (userSession.currentIndex > 0) {
                        userSession.currentIndex--;
                    }
                    break;

                case 'next':
                    if (userSession.currentIndex < userSession.products.length - 1) {
                        userSession.currentIndex++;
                    }
                    break;

                case 'sort_asc':
                    userSession.products.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
                    userSession.currentIndex = 0;
                    break;

                case 'sort_desc':
                    userSession.products.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
                    userSession.currentIndex = 0;
                    break;

                default:
                    console.warn(`Неизвестный callback_data: ${query.data}`);
                    return;
            }

            await updateProductCard(bot, chatId, userSession);
        } else {
            console.warn(`Нет доступных продуктов для отображения для userId: ${userId}`);
            await bot.sendMessage(chatId, i18next.t('error.no_products'));
        }
    } catch (error) {
        console.error(`Ошибка при обработке callback_query: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.callback_processing'));
    } finally {
        userSession.isProcessing = false;
    }
});


// Обработка входящих сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        await initializeDefaultUserSettings(userId);
        const userSettings = await getUserSettings(userId);

        if (!userSettings.language) {
            const defaultLanguage = process.env.LANGUAGE || 'eng';
            await saveUserSettings(userId, { language: defaultLanguage });
            console.log(`Язык по умолчанию ${defaultLanguage} сохранен для пользователя ${userId}.`);
        }

        await initializeI18next(userSettings.language || 'eng');
        await updateI18nextLanguage(chatId);

        if (typeof msg.text === 'string') {
            const commandParts = msg.text.split(' ');
            const command = commandParts[0];
            const comandsToCancelSearch = ['/location', '/start', '/help', '/language', '/settings'];

            if (command.startsWith('/')) {
                if (userSessions[userId]?.awaitingProductName) {
                    console.log(`Режим ожидания названия товара сброшен для пользователя ${userId} из-за команды ${command}.`);
                    delete userSessions[userId].awaitingProductName;
                }

                if (comands[command]) {
                    if (command === '/search') {
                        if (commandParts.length > 1) {
                            const productName = commandParts.slice(1).join(' ');
                            await comands[command].execute(bot, chatId, userId, productName);
                        } else {
                            await bot.sendMessage(chatId, i18next.t('search.enter_product_name'));
                            userSessions[userId] = { awaitingProductName: true };
                        }
                    } else {
                        await comands[command].execute(bot, chatId, userId);
                    }
                    console.log(`Команда ${command} успешно выполнена для пользователя ${userId}.`);
                } else {
                    const response = `${i18next.t('response.unknown_command')} ${msg.text}`;
                    await bot.sendMessage(chatId, response);
                    console.log(`Неизвестная команда ${command} от пользователя ${userId}.`);
                }
            } else if (userSessions[userId]?.awaitingProductName) {
                const productName = msg.text.trim();
                if (productName) {
                    await comands['/search'].execute(bot, chatId, userId, productName);
                } else {
                    await bot.sendMessage(chatId, i18next.t('search.empty_product_name'));
                }
            } else {
                console.log(`Получено не текстовое сообщение от пользователя ${userId}`);
            }

            if (msg.text === i18next.t('start.welcome.search_command')) {
                userSessions[userId] = { awaitingSearchAfterWelcome: true };
            }
        }
    } catch (error) {
        console.error(`Ошибка при обработке сообщения: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
});



process.on('unhandledRejection', (error) => {
    console.error('Необработанное исключение:', error);
});

// Запуск бота
(async () => {
    try {
        await initializeI18next();
        console.log('Бот успешно запущен и готов к работе!');
    } catch (error) {
        console.error('Ошибка при запуске бота:', error);
    }
})();

