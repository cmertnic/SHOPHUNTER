require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { initializeI18next, updateI18nextLanguage, i18next } = require('./i18n');
const { getUserSettings, saveUserSettings, initializeDefaultUserSettings, updateUserLocation } = require('./database/settingsDb');
const { handleTextMessage, changeLanguage, sendMainMenu, handleManualLocationInput } = require('./events');

// Инициализация бота
const token = process.env.TOKEN;
if (!token) {
    console.error('Токен бота не найден. Убедитесь, что переменная TOKEN установлена в .env файле.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log('ShopHunter готов к работе');

// Загружаем команды
const commands = {};
const commandFolders = fs.readdirSync(path.join(__dirname, 'commands'));

// Загружаем команды из папок
for (const folder of commandFolders) {
    const commandFiles = fs.readdirSync(path.join(__dirname, 'commands', folder)).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(__dirname, 'commands', folder, file));
        if ('name' in command && 'execute' in command) {
            commands[command.name] = command;
            console.log(`Команда ${command.name} загружена из папки ${folder}.`);
        } else {
            console.log(`Предупреждение! Команда по пути ./commands/${folder}/${file} потеряла свойство "name" или "execute".`);
        }
    }
}

// Обработка callback_query
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);
});

// Обработка ошибок при работе с ботом
bot.on('polling_error', (error) => {
    console.error(`Ошибка при работе с ботом: ${error.message}`);
});

// Обработка текстовых сообщений
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageText = msg.text;

    try {
        const userSettings = await getUserSettings(userId); // Получаем настройки пользователя

        if (messageText === i18next.t('settings.change_language')) {
            await changeLanguage(bot, chatId);
        } else if (messageText === i18next.t('settings.back')) {
            await commands['/start'].execute(bot, chatId);
        } else if (messageText === i18next.t('location.enter_location_manually')) {
            await bot.sendMessage(chatId, i18next.t('location.enter_location'));
        } else {
            // Обновленное регулярное выражение
            const locationRegex = /^([а-яА-ЯёЁ\w\s]+),\s*([а-яА-ЯёЁ\w\s]+)(?:,\s*(.*))?$/;
            const match = messageText.match(locationRegex);

            if (match) {
                // Передаем bot в функцию handleManualLocationInput
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



// Обработка входящих сообщений
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
            const commandParts = msg.text.split(' ');
            const command = commandParts[0];

            if (command.startsWith('/')) {
                if (commands[command]) {
                    // Если команда /search, передаем название товара
                    if (command === '/search' && commandParts.length > 1) {
                        const productName = commandParts.slice(1).join(' ');
                        await commands[command].execute(bot, chatId, userId, productName);
                    } else {
                        await commands[command].execute(bot, chatId, userId);
                    }
                    console.log(`Команда ${command} успешно выполнена для пользователя ${userId}.`);
                } else {
                    const response = `${i18next.t('response.unknown_command')} ${msg.text}`;
                    await bot.sendMessage(chatId, response);
                    console.log(`Неизвестная команда ${command} от пользователя ${userId}.`);
                }
            }
        } else {
            console.log(`Получено не текстовое сообщение от пользователя ${userId}`);
        }
    } catch (error) {
        console.error(`Ошибка при обработке сообщения: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
});




// Обработка местоположения
bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const location = msg.location;

    console.log(`Пользователь ${userId} отправил местоположение: ${location.latitude}, ${location.longitude}`);

    try {
        await updateUserLocation(userId, { latitude: location.latitude, longitude: location.longitude });
        await bot.sendMessage(chatId, `Ваше местоположение: ${location.latitude}, ${location.longitude} успешно сохранено.`);
    } catch (error) {
        console.error(`Ошибка при сохранении местоположения: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.saving_location'));
    }
});
