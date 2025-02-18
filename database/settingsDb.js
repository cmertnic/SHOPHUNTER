// Подключаем необходимые модули
const dotenv = require('dotenv');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Загружаем переменные окружения из файла .env
dotenv.config();

// Проверяем наличие переменной окружения SQLITE_SETTINGS_DB_PATH
if (!process.env.SQLITE_SETTINGS_DB_PATH) {
  console.error('Переменная окружения SQLITE_SETTINGS_DB_PATH не определена.');
  process.exit(1);
}

// Получаем путь к базе данных из переменной окружения
const dbPath = path.resolve(process.env.SQLITE_SETTINGS_DB_PATH);

// Создаем новое подключение к базе данных
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(`Ошибка при подключении к базе данных: ${err.message}`);
    process.exit(1);
  }
  console.log('Подключено к базе данных настроек');
});

// Создаем таблицу user_settings, если она еще не создана
db.run(`CREATE TABLE IF NOT EXISTS user_settings (
  userId TEXT PRIMARY KEY,
  language TEXT,
  location TEXT
);`, (err) => {
  if (err) {
    console.error(`Ошибка при создании таблицы user_settings: ${err.message}`);
    process.exit(1);
  }
  console.log('Таблица user_settings создана');
});

// Функция для сохранения настроек пользователя в базе данных
function saveUserSettings(userId, settings) {
  return new Promise((resolve, reject) => {
    const { language, location } = settings;

    db.run(`REPLACE INTO user_settings
            (userId, language, location)
            VALUES (?, ?, ?)`,
      [userId, language, JSON.stringify(location)], (err) => {
        if (err) {
          console.error(`Ошибка при сохранении настроек пользователя: ${err.message}`);
          reject(err);
        } else {
          console.log(`Настройки пользователя ${userId} сохранены`);
          resolve();
        }
      });
  });
}

// Функция для получения настроек пользователя из базы данных
async function getUserSettings(userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM user_settings WHERE userId = ?`, [userId], (err, row) => {
      if (err) {
        console.error(`Ошибка при получении настроек пользователя: ${err.message}`);
        reject(err);
      } else {
        resolve(row || {});
      }
    });
  });
}

// Функция для инициализации настроек пользователя по умолчанию
async function initializeDefaultUserSettings(userId) {
  try {
    const settings = await getUserSettings(userId);
    if (!settings.language) {
      const defaultSettings = {
        language: process.env.LANGUAGE || 'rus',
        location: process.env.LOCATION || null, 
      };

      // Сохраняем настройки по умолчанию
      await saveUserSettings(userId, defaultSettings);
      console.log(`Настройки по умолчанию инициализированы для пользователя: ${userId}`);
    }
  } catch (err) {
    console.error(`Ошибка при инициализации настроек пользователя: ${err.message}`);
    throw err;
  }
}

// Функция для обновления местоположения пользователя
async function updateUserLocation(userId, location) {
  try {
    const settings = await getUserSettings(userId); // Получаем текущие настройки пользователя
    settings.location = location; // Обновляем местоположение
    await saveUserSettings(userId, settings); // Сохраняем обновленные настройки
    console.log(`Местоположение пользователя ${userId} обновлено: ${JSON.stringify(location)}`);
  } catch (err) {
    console.error(`Ошибка при обновлении местоположения пользователя: ${err.message}`);
    throw err;
  }
}

// Функция для обновления настроек пользователя в базе данных
async function updateUserSettings(userId, newSettings) {
  try {
    await saveUserSettings(userId, newSettings);
    console.log(`Настройки пользователя ${userId} обновлены`);
  } catch (err) {
    console.error(`Ошибка при обновлении настроек пользователя: ${err.message}`);
    throw err;
  }
}

// Экспортируем функции для использования в других модулях
module.exports = {
  saveUserSettings,
  initializeDefaultUserSettings,
  getUserSettings,
  updateUserSettings,
  updateUserLocation
};
