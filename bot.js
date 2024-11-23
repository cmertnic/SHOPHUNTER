require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { initializeI18next, updateI18nextLanguage, i18next } = require('./i18n');
const { initializeDefaultUserSettings, getUserSettings, saveUserSettings, updateUserSettings } = require('./database/settingsDb');
const { handleTextMessage } = require('./events');

const token = process.env.TOKEN;
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

// Функция для создания клавиатуры с командами
function createMainMenuKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '/start' }, { text: '/settings' }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
        },
    };
}

// Функция для отправки меню
async function sendMainMenu(chatId) {
    const keyboard = createMainMenuKeyboard(); // Получаем клавиатуру
    await bot.sendMessage(chatId, ('-----'), keyboard); // Отправляем сообщение с текстом и клавиатурой
}

// Обработка входящих сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        await initializeDefaultUserSettings(userId);
        const userSettings = await getUserSettings(userId);

        // Проверка языка
        if (!userSettings.language) {
            const defaultLanguage = process.env.LANGUAGE || 'rus';
            await saveUserSettings(userId, { language: defaultLanguage });
            console.log(`Язык по умолчанию ${defaultLanguage} сохранен для пользователя ${userId}.`);
        }

        await initializeI18next(userSettings.language || 'rus');
        await updateI18nextLanguage(chatId);

        const command = msg.text.split(' ')[0]; // Извлекаем команду

        if (command.startsWith('/')) { // Проверяем, начинается ли команда с '/'
            if (commands[command]) {
                await commands[command].execute(bot, chatId, userId);
                console.log(`Команда ${command} успешно выполнена для пользователя ${userId}.`);
            } else {
                const response = `${i18next.t('response.unknown_command')} ${msg.text}`;
                await bot.sendMessage(chatId, response);
                console.log(`Неизвестная команда ${command} от пользователя ${userId}.`);
            }
        } else {
            // Если сообщение не является командой, отправляем меню
            await sendMainMenu(chatId);
        }
    } catch (error) {
        console.error(`Ошибка при обработке сообщения: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
});

// Обработка текстовых сообщений для кнопок
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const userSettings = await getUserSettings(userId);
        const messageText = msg.text;

        if (messageText === i18next.t('settings.change_language')) {
            // Смена языка
            let newLanguage = userSettings.language === 'rus' ? 'eng' : 'rus';

            // Обновляем язык в базе данных
            await updateUserSettings(userId, { language: newLanguage });
            userSettings.language = newLanguage; // Обновляем язык в текущих настройках

            // Обновляем язык в i18next
            await updateI18nextLanguage(chatId, newLanguage);

            // Отправляем сообщение о смене языка
            const languageChangedMessage = i18next.t('settings.language_changed', { language: newLanguage });

            // Проверяем, что текст не равен ключу
            if (languageChangedMessage === 'settings.language_changed') {
                console.error('Ключ для смены языка не найден в переводах.');
                return; // Прекращаем выполнение, если ключ не найден
            }

            // Удаляем лишний обратный слэш, если он есть
            const safeMessage = languageChangedMessage.replace(/\\$/, '');

            await bot.sendMessage(chatId, safeMessage, { parse_mode: 'Markdown' });

            // Повторно вызываем /settings для обновления
            await commands['/settings'].execute(bot, chatId); // Убедитесь, что путь к файлу настроек правильный
        } else if (messageText === i18next.t('settings.back')) {
            // Возврат к команде /start
            await commands['/start'].execute(bot, chatId);
        } else {
            // Обработка других текстовых сообщений
            handleTextMessage(bot, chatId, messageText);
        }
    } catch (error) {
        console.error(`Ошибка при обработке текстового сообщения: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
});

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await sendMainMenu(chatId);
});
