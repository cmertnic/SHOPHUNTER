require('dotenv').config();
const axios = require('axios');
const { i18next, initializeI18next, updateI18nextLanguage } = require('./i18n');
const { updateUserSettings, getUserSettings, updateUserLocation } = require('./database/settingsDb');

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
    if (messageText === i18next.t('settings.change_language')) {
        await changeLanguage(bot, chatId);
    } else if (messageText === i18next.t('settings.back')) {
        await bot.sendMessage(chatId, i18next.t('start.welcome_message'), { parse_mode: 'Markdown' });
        await sendMainMenu(bot, chatId);
    }
}

// Функция для изменения языка
async function changeLanguage(bot, chatId) {
    try {
        const userId = chatId;
        let userSettings = await getUserSettings(userId);
        let newLanguage = userSettings.language === 'rus' ? 'eng' : 'rus';

        await updateUserSettings(userId, { language: newLanguage });
        await updateI18nextLanguage(chatId, newLanguage);

        const languageChangedMessage = i18next.t('settings.language_changed');
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

        console.log(`Пользователь ${userId} ввел местоположение вручную: Страна: ${country}, Город: ${city}, Улица: ${street}`);

        try {
            const address = `${country}, ${city}${street ? ', ' + street : ''}`;
            const coordinates = await getCoordinatesFromNominatim(address);

            // Проверяем, были ли получены координаты
            if (coordinates && !coordinates.error) {
                console.log(`Координаты для пользователя ${userId}: ${JSON.stringify(coordinates)}`);

                // Сохраняем только координаты в БД
                await updateUserLocation(userId, { coordinates });

                await bot.sendMessage(chatId, `Ваш адрес: ${address} успешно сохранен. Координаты: ${JSON.stringify(coordinates)}`);
            } else {
                // Если координаты не найдены, уведомляем пользователя
                await bot.sendMessage(chatId, `Координаты не были найдены для введенного адреса. Пожалуйста, проверьте введенные данные.`);
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
async function searchProductNearby(productName) {
    const apiUrl = 'http://localhost:3000/products/all';
  
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
  
      // Фильтруем данные по имени товара
      const filteredData = data.products.filter(item => 
        item.name.toLowerCase().includes(productName.toLowerCase())
      ).map(item => ({
        id: item.id, 
        name: item.name,
        price: item.price,
        description: item.description || 'Нет описания', 
        url: item.url,
      }));
  
      return filteredData;
    } catch (error) {
      console.error(`Ошибка при поиске товара: ${error.message}`);
      return [];
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
    getUserLocation
};
