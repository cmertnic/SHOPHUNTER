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
    const userId = query.from.id;

    if (!userSessions[userId]) {
        console.warn(`Сессия пользователя не найдена для userId: ${userId}. Создаем новую сессию.`);
        const userSettings = await getUserSettings(userId);
        userSessions[userId] = {
            isProcessing: false,
            currentIndex: 0,
            products: [],
            language: userSettings ? userSettings.language : 'rus',
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

        const localesPath = path.join(__dirname, './locales');
        const availableLanguages = fs.readdirSync(localesPath).map(file => file.replace('.json', ''));

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

bot.on('polling_error', (error) => {
    console.error(`Ошибка при работе с ботом: ${error.message}`);
});

// Обработка входящих сообщений (текст и др.)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        await initializeDefaultUserSettings(userId);
        const userSettings = await getUserSettings(userId);

        if (!userSettings.language) {
            const defaultLanguage = process.env.LANGUAGE || 'rus';
            await saveUserSettings(userId, { language: defaultLanguage });
            console.log(`Язык по умолчанию ${defaultLanguage} сохранен для пользователя ${userId}.`);
        }

        await initializeI18next(userSettings.language || 'rus');
        await updateI18nextLanguage(chatId);

        if (typeof msg.text === 'string') {
            const text = msg.text.trim();

            // Обработка локализованных команд
            const localizedCommandsMap = {
                [i18next.t('start.welcome.search_command')]: '/search',
                [i18next.t('start.welcome.settings_command')]: '/settings',
                [i18next.t('start.welcome.help_command')]: '/help',
                [i18next.t('settings.change_language')]: '/language',
                [i18next.t('start.welcome.location_command')]: '/location',
                [i18next.t('settings.back')]: '/start',
            };

            // Проверяем локализованную команду
            const commandFromLocalized = localizedCommandsMap[text];

            if (commandFromLocalized) {
                if (userSessions[userId]?.awaitingProductName) {
                    console.log(`Режим ожидания названия товара сброшен для пользователя ${userId} из-за команды ${commandFromLocalized}.`);
                    delete userSessions[userId].awaitingProductName;
                }

                if (comands[commandFromLocalized]) {
                    if (commandFromLocalized === '/search') {
                        await bot.sendMessage(chatId, i18next.t('search.enter_product_name'));
                        userSessions[userId] = userSessions[userId] || {};
                        userSessions[userId].awaitingProductName = true;
                    } else {
                        await comands[commandFromLocalized].execute(bot, chatId, userId);
                    }
                    console.log(`Команда ${commandFromLocalized} успешно выполнена для пользователя ${userId}.`);
                } else {
                    await bot.sendMessage(chatId, i18next.t('response.unknown_command'));
                    console.log(`Неизвестная команда ${commandFromLocalized} от пользователя ${userId}.`);
                }
                return;
            }

            // Если текст начинается с '/', это команда
            if (text.startsWith('/')) {
                if (userSessions[userId]?.awaitingProductName) {
                    console.log(`Режим ожидания названия товара сброшен для пользователя ${userId} из-за команды ${text}.`);
                    delete userSessions[userId].awaitingProductName;
                }

                const commandParts = text.split(' ');
                const command = commandParts[0];

                if (comands[command]) {
                    if (command === '/search') {
                        if (commandParts.length > 1) {
                            const productName = commandParts.slice(1).join(' ');
                            await comands[command].execute(bot, chatId, userId, productName);
                        } else {
                            await bot.sendMessage(chatId, i18next.t('search.enter_product_name'));
                            userSessions[userId] = userSessions[userId] || {};
                            userSessions[userId].awaitingProductName = true;
                        }
                    } else {
                        await comands[command].execute(bot, chatId, userId);
                    }
                    console.log(`Команда ${command} успешно выполнена для пользователя ${userId}.`);
                } else {
                    const response = `${i18next.t('response.unknown_command')} ${text}`;
                    await bot.sendMessage(chatId, response);
                    console.log(`Неизвестная команда ${command} от пользователя ${userId}.`);
                }
                return;
            }

            // Если пользователь в режиме ожидания названия продукта
            if (userSessions[userId]?.awaitingProductName) {
                const productName = text;
                if (productName) {
                    const found = await comands['/search'].execute(bot, chatId, userId, productName);
                    if (found) {
                        delete userSessions[userId].awaitingProductName;
                    } 
                } else {
                    await bot.sendMessage(chatId, i18next.t('search.empty_product_name'));
                }
                return;
            }

            // Обработка ввода местоположения вручную
            if (text === i18next.t('location.enter_location_manually')) {
                await bot.sendMessage(chatId, i18next.t('location.enter_location'));
                return;
            }

            // Проверка формата локации (например, "Город, Регион")
            const locationRegex = /^([а-яА-ЯёЁ\w\s]+),\s*([а-яА-ЯёЁ\w\s]+)(?:,\s*(.*))?$/;
            const match = text.match(locationRegex);

            if (match) {
                await handleManualLocationInput(bot, msg, chatId, userId, text);
                return;
            }

            // Если текст не команда, не в режиме ожидания и не локация — можно обработать как обычный текст
            console.log(`Получено нераспознанное текстовое сообщение от пользователя ${userId}: ${text}`);
            // Здесь можно добавить дополнительную обработку обычных сообщений, если нужно
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
