require('dotenv').config();
const axios = require('axios');
const { i18next, updateI18nextLanguage } = require('./i18n');
const { updateUserSettings, getUserSettings, updateUserLocation } = require('./database/settingsDb');
const fs = require('fs');
const path = require('path');
// Функция для получения координат из Nominatim
async function getCoordinatesFromNominatim(address) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1`;

    try {
        const response = await axios.get(url);
        if (response.data.length > 0) {
            const location = response.data[0];
            return { lat: location.lat, lon: location.lon };
        } else {
            throw new Error('Geocoding failed: no results found');
        }
    } catch (error) {
        console.error(`Ошибка при получении координат: ${error.message}`);
        return { error: 'Произошла ошибка при обращении к Nominatim. Пожалуйста, попробуйте позже.' };
    }
}

// Функция для обработки текстовых сообщений
async function handleTextMessage(bot, chatId, messageText) {
 if (messageText === i18next.t('settings.back')) {
        await bot.sendMessage(chatId, i18next.t('start.welcome_message'), { parse_mode: 'Markdown' });
        await sendMainMenu(bot, chatId);
    }
}

// Функция для изменения языка
async function changeLanguage(bot, chatId, newLanguage) {
    try {
        const userId = chatId; 
        let userSettings = await getUserSettings(userId);

        if (!userSettings) {
            throw new Error('Настройки пользователя не найдены');
        }

        // Получаем доступные языки из директории locales
        const localesPath = path.join(__dirname, './locales');
        const availableLanguages = fs.readdirSync(localesPath).map(file => file.replace('.json', ''));

        // Проверяем, существует ли новый язык в доступных языках
        if (!availableLanguages.includes(newLanguage)) {
            throw new Error(`Язык '${newLanguage}' не доступен.`);
        }

        const updatedSettings = {
            language: newLanguage
        };
        await updateUserSettings(userId, updatedSettings);
        await updateI18nextLanguage(userId, newLanguage);
        const languageChangedMessage = i18next.t('settings.language_changed', { language: i18next.t(`languages.${newLanguage}`) });
        await bot.sendMessage(chatId, languageChangedMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(`Ошибка при изменении языка: ${error.message}`);
        await bot.sendMessage(chatId, i18next.t('error.general'), { parse_mode: 'Markdown' });
    }
}


// Создание клавиатуры главного меню
function createMainMenuKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '/start' }, { text: '/settings' }, { text: '/location' }],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
        },
    };
}

// Отправка главного меню
async function sendMainMenu(bot, chatId) {
    const keyboard = createMainMenuKeyboard();
    await bot.sendMessage(chatId, i18next.t('menu.loading'), keyboard);
}

// Обработка ввода местоположения вручную
async function handleManualLocationInput(bot, msg, chatId, userId, messageText) {
    const locationRegex = /^([а-яА-ЯёЁ\w\s]+),\s*([а-яА-ЯёЁ\w\s]+)(?:,\s*(.*))?$/;
    const match = messageText.match(locationRegex);

    let country = null, city = null, street = null;

    console.log(`Пользователь ${userId} ввел сообщение: "${messageText}"`);

    if (match) {
        country = match[1].trim();
        city = match[2].trim();
        street = match[3] ? match[3].trim() : '';

        console.log(`Пользователь ${userId} ввел местоположение вручную: Страна: ${country},Город: ${city},Улица: ${street}`);

        try {
            const address = `${country}, ${city}${street ? ', ' + street : ''}`;
            const coordinates = await getCoordinatesFromNominatim(address);

            // Проверяем, были ли получены координаты
            if (coordinates && !coordinates.error) {
                console.log(`Координаты для пользователя ${userId}: ${JSON.stringify(coordinates)}`);
                await updateUserLocation(userId, { coordinates });

                await bot.sendMessage(chatId, i18next.t('location.location_saved', { address }));
                await bot.sendMessage(chatId, `${JSON.stringify(coordinates)}`);
            } else {
                await bot.sendMessage(chatId, i18next.t('location.location_lost', { address }));
            }
        } catch (error) {
            console.error(`Ошибка при обновлении местоположения для пользователя ${userId}: ${error.message}`);
            await bot.sendMessage(chatId, i18next.t('error.saving_location'));
        }
    } else {
        console.warn(`Пользователь ${userId} ввел неверный формат местоположения: "${messageText}"`);
        await bot.sendMessage(chatId, i18next.t('error.invalid_location_format'));
    }
}

// Функция для получения местоположения пользователя из базы данных
async function getUserLocation(userId) {
    try {
        const settings = await getUserSettings(userId);
        if (settings.location) {
            return JSON.parse(settings.location);
        } else {
            throw new Error('Местоположение не найдено');
        }
    } catch (error) {
        console.error(`Ошибка при получении местоположения пользователя: ${error.message}`);
        return null;
    }
}

// Функция для поиска товара
async function searchProductNearby(query, isCommand = false, limit = 1000) {
    const apiUrl = 'http://localhost:3000/products/all';

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Если запрос сделан через команду и query не передан
        if (isCommand && (!query || query.trim() === '')) {
            return data.products.slice(0, limit).map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                img: item.img,
                url: item.url,
            }));
        }

        // Фильтруем данные по имени товара
        const filteredData = data.products.filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase())
        ).map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            url: item.url,
            img: item.img,
        }));

        return filteredData.slice(0, limit); // Ограничиваем результат до limit
    } catch (error) {
        console.error(`Ошибка при поиске товара: ${error.message}`);
        return [];
    }
}

// Функция для извлечения числовой цены из строки
const parsePrice = (priceString) => {
    const priceNumber = parseFloat(priceString.replace(/[^\d.-]/g, ''));
    return isNaN(priceNumber) ? 0 : priceNumber;
};
// Функция для нового сообщения при search
async function sendProductCard(bot, chatId, userSession) {
    const { products, currentIndex } = userSession;
    const product = products[currentIndex];
    const totalProducts = products.length;

    const responseMessage = `
      ${product.img ? `<a href="${product.img}">&#8203;</a>` : ''}
      <b>${product.name}</b>
      <b>${i18next.t('search.cost')}:</b> <i>${product.price}</i>
    `;

    const inlineOptions = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${i18next.t('search.product')} ${currentIndex + 1} ${i18next.t('search.of')} ${totalProducts}`, callback_data: 'no_action' },
                ],
                [
                    { text: i18next.t('search.previous'), callback_data: 'prev' },
                    { text: i18next.t('search.next'), callback_data: 'next' },
                ],
                [
                    { text: i18next.t('search.sort_ascending'), callback_data: 'sort_asc' },
                    { text: i18next.t('search.sort_descending'), callback_data: 'sort_desc' },
                ],
                [
                    { text: i18next.t('search.open_product'), url: product.url },
                ],
            ],
        },
    };

    try {
        // Если это новый запрос (например, /search), удаляем предыдущее сообщение
        if (userSession.lastMessageId) {
            await bot.deleteMessage(chatId, userSession.lastMessageId);
        }

        // Отправляем новое сообщение
        const sentMessage = await bot.sendMessage(chatId, responseMessage, {
            parse_mode: 'HTML',
            reply_markup: inlineOptions.reply_markup,
        });

        // Сохраняем ID нового сообщения
        userSession.lastMessageId = sentMessage.message_id;

    } catch (error) {
        console.error(`Ошибка при отправке или удалении сообщения: ${error.message}`);
    }
}

// Функция для обновления сообщения при перелистывании
async function updateProductCard(bot, chatId, userSession) {
    const { products, currentIndex } = userSession;
    const product = products[currentIndex];
    const totalProducts = products.length;

    const responseMessage = `
        ${product.img ? `<a href="${product.img}">&#8203;</a>` : ''}
        <b>${product.name}</b>
        <b>${i18next.t('search.cost')}:</b> <i>${product.price}</i>
      `;

    const inlineOptions = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${i18next.t('search.product')} ${currentIndex + 1} ${i18next.t('search.of')} ${totalProducts}`, callback_data: 'no_action' },
                ],
                [
                    { text: i18next.t('search.previous'), callback_data: 'prev' },
                    { text: i18next.t('search.next'), callback_data: 'next' },
                ],
                [
                    { text: i18next.t('search.sort_ascending'), callback_data: 'sort_asc' },
                    { text: i18next.t('search.sort_descending'), callback_data: 'sort_desc' },
                ],
                [
                    { text: i18next.t('search.open_product'), url: product.url },
                ],
            ],
        },
    };

    try {
        // Обновляем уже отправленное сообщение
        await bot.editMessageText(responseMessage, {
            chat_id: chatId,
            message_id: userSession.lastMessageId,
            parse_mode: 'HTML',
            reply_markup: inlineOptions.reply_markup,
        });

    } catch (error) {
        console.error(`Ошибка при редактировании сообщения: ${error.message}`);
    }
}

// Экспортируем функции для использования в других модулях
module.exports = {
    handleTextMessage,
    changeLanguage,
    sendMainMenu,
    handleManualLocationInput,
    getCoordinatesFromNominatim,
    searchProductNearby,
    getUserLocation,
    parsePrice,
    sendProductCard,
    updateProductCard
};
