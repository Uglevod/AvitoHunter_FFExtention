// Popup script для управления настройками

class PopupController {
  constructor() {
    this.settings = {};
    this.updateInterval = null;
    this.initializeElements();
    this.loadSettings();
    this.setupEventListeners();
    this.startStatsUpdater();
  }

  // Инициализация элементов DOM
  initializeElements() {
    this.botTokenInput = document.getElementById('botToken');
    this.chatIdInput = document.getElementById('chatId');
    // refreshIntervalSelect удален из UI, но логика остается
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.testTelegramBtn = document.getElementById('testTelegramBtn');
    this.statusDiv = document.getElementById('status');
    this.statsDiv = document.getElementById('stats');
    // trackedTabsSpan удален из UI, но логика остается
    this.cachedItemsSpan = document.getElementById('cachedItems');
    this.telegramMessagesSpan = document.getElementById('telegramMessages');
    this.lastUpdateSpan = document.getElementById('lastUpdate');
  }

  // Загрузка настроек
  async loadSettings() {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getSettings' });
      this.settings = response.settings || {};
      
      console.log('Popup: Загружены настройки:', this.settings);
      console.log('Popup: Интервал из настроек:', this.settings.refreshInterval);
      
      // Заполняем форму
      this.botTokenInput.value = this.settings.telegramBotToken || '';
      this.chatIdInput.value = this.settings.telegramChatId || '';
      // refreshIntervalSelect удален из UI, но настройка остается в коде
      
      console.log('Popup: Интервал обновления (скрыт):', this.settings.refreshInterval || 5);
      
      // Обновляем статистику
      this.updateStats();
      
      // Обновляем состояние кнопок
      this.updateButtonStates();
      
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
      this.showStatus('Ошибка загрузки настроек', 'error');
    }
  }

  // Сохранение настроек
  async saveSettings() {
    this.settings = {
      ...this.settings,
      telegramBotToken: this.botTokenInput.value.trim(),
      telegramChatId: this.chatIdInput.value.trim(),
      refreshInterval: this.settings.refreshInterval || 5, // Используем сохраненное значение или по умолчанию
      isEnabled: this.settings.isEnabled || false
    };

    console.log('Popup: Сохраняем настройки:', this.settings);
    console.log('Popup: Интервал обновления (скрыт):', this.settings.refreshInterval, 'минут');

    try {
      await browser.runtime.sendMessage({
        action: 'saveSettings',
        settings: this.settings
      });
      
      console.log('Popup: Настройки успешно сохранены');
      this.showStatus('Настройки сохранены', 'success');
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      this.showStatus('Ошибка сохранения настроек', 'error');
    }
  }

  // Настройка обработчиков событий
  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startTracking());
    this.stopBtn.addEventListener('click', () => this.stopTracking());
    this.testTelegramBtn.addEventListener('click', () => this.testTelegramMessage());
    
    // Обработчики для скрытых кнопок интервала
    const intervalButtons = document.querySelectorAll('[data-interval]');
    intervalButtons.forEach(button => {
      button.addEventListener('click', () => {
        const interval = parseInt(button.dataset.interval);
        this.setRefreshInterval(interval);
      });
    });
    
    // Сохранение при изменении полей
    [this.botTokenInput, this.chatIdInput].forEach(element => {
      element.addEventListener('change', () => {
        console.log('Popup: Изменение поля:', element.id, 'новое значение:', element.value);
        this.saveSettings();
      });
      element.addEventListener('input', () => {
        console.log('Popup: Ввод в поле:', element.id, 'новое значение:', element.value);
        this.saveSettings();
      });
    });
  }

  // Установка интервала обновления
  async setRefreshInterval(interval) {
    console.log('Popup: Установка интервала обновления:', interval, 'минут');
    this.settings.refreshInterval = interval;
    await this.saveSettings();
    this.showStatus(`Интервал обновления установлен: ${interval} минут`, 'info');
  }

  // Запуск отслеживания
  async startTracking() {
    // Валидация
    if (!this.botTokenInput.value.trim()) {
      this.showStatus('Введите токен бота', 'error');
      return;
    }
    
    if (!this.chatIdInput.value.trim()) {
      this.showStatus('Введите ID чата', 'error');
      return;
    }

    // Сохраняем настройки
    await this.saveSettings();
    
    // Включаем отслеживание
    this.settings.isEnabled = true;
    await this.saveSettings();
    
    console.log('Popup: Запускаем отслеживание с интервалом:', this.settings.refreshInterval, 'минут');

    try {
      // Получаем активную вкладку
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        this.showStatus('Нет активной вкладки', 'error');
        return;
      }

      const activeTab = tabs[0];
      
      // Проверяем, что это страница Avito
      if (!activeTab.url.includes('avito.ru')) {
        this.showStatus('Откройте страницу Avito для отслеживания', 'error');
        return;
      }

      // Запускаем отслеживание
      await browser.runtime.sendMessage({
        action: 'startTracking',
        tabId: activeTab.id
      });

      this.showStatus('Отслеживание запущено!', 'success');
      this.updateButtonStates();
      this.updateStats(); // Обновляем статистику сразу
      
    } catch (error) {
      console.error('Ошибка запуска отслеживания:', error);
      this.showStatus('Ошибка запуска отслеживания', 'error');
    }
  }

  // Остановка отслеживания
  async stopTracking() {
    try {
      // Получаем активную вкладку
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        await browser.runtime.sendMessage({
          action: 'stopTracking',
          tabId: tabs[0].id
        });
      }

      // Отключаем отслеживание
      this.settings.isEnabled = false;
      await this.saveSettings();

      this.showStatus('Отслеживание остановлено', 'info');
      this.updateButtonStates();
      this.updateStats(); // Обновляем статистику сразу
      
    } catch (error) {
      console.error('Ошибка остановки отслеживания:', error);
      this.showStatus('Ошибка остановки отслеживания', 'error');
    }
  }


  // Тестовая отправка сообщения в Telegram
  async testTelegramMessage() {
    try {
      // Проверяем, что настройки Telegram заполнены
      if (!this.settings.telegramBotToken || !this.settings.telegramChatId) {
        this.showStatus('Сначала заполните настройки Telegram', 'error');
        return;
      }

      // Показываем статус отправки
      this.showStatus('Отправка тестового сообщения...', 'info');
      this.testTelegramBtn.disabled = true;
      this.testTelegramBtn.textContent = '⏳ Отправка...';

      // Отправляем тестовое сообщение через background script
      const response = await browser.runtime.sendMessage({
        action: 'testTelegramMessage'
      });

      if (response.success) {
        this.showStatus('Тестовое сообщение отправлено успешно!', 'success');
        console.log('Popup: Тестовое сообщение отправлено успешно');
        this.updateStats(); // Обновляем статистику
      } else {
        this.showStatus(`Ошибка отправки: ${response.error}`, 'error');
        console.error('Popup: Ошибка отправки тестового сообщения:', response.error);
      }
      
    } catch (error) {
      console.error('Ошибка тестовой отправки:', error);
      this.showStatus('Ошибка тестовой отправки', 'error');
    } finally {
      // Восстанавливаем кнопку
      this.testTelegramBtn.disabled = false;
      this.testTelegramBtn.textContent = '📤 Тест Telegram';
    }
  }

  // Обновление состояния кнопок
  updateButtonStates() {
    if (this.settings.isEnabled) {
      this.startBtn.disabled = true;
      this.startBtn.textContent = '🔄 Активно';
      this.stopBtn.disabled = false;
    } else {
      this.startBtn.disabled = false;
      this.startBtn.textContent = '▶️ Запустить';
      this.stopBtn.disabled = true;
    }
  }

  // Показ статуса
  showStatus(message, type = 'info') {
    this.statusDiv.textContent = message;
    this.statusDiv.className = `status ${type}`;
    this.statusDiv.style.display = 'block';
    
    // Скрываем статус через 3 секунды
    setTimeout(() => {
      this.statusDiv.style.display = 'none';
    }, 3000);
  }

  // Запуск автоматического обновления статистики
  startStatsUpdater() {
    // Обновляем статистику сразу
    this.updateStats();
    
    // Обновляем каждые 2 секунды
    this.updateInterval = setInterval(() => {
      this.updateStats();
    }, 20000);
  }

  // Остановка обновления статистики
  stopStatsUpdater() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Обновление статистики
  async updateStats() {
    try {
      // Получаем актуальные настройки
      const response = await browser.runtime.sendMessage({ action: 'getSettings' });
      const currentSettings = response.settings || {};
      
      console.log('Popup: Получены настройки:', currentSettings);
      console.log('Popup: trackedTabs:', currentSettings.trackedTabs);
      
      // Получаем количество отслеживаемых вкладок (логика остается, но не отображается)
      const trackedTabs = currentSettings.trackedTabs ? 
        Object.keys(currentSettings.trackedTabs).length : 0;
      
      console.log('Popup: Количество отслеживаемых вкладок (скрыто):', trackedTabs);
      
      // Получаем количество элементов в кеше
      const result = await browser.storage.local.get(['cachedItems']);
      const cachedItems = result.cachedItems ? 
        Object.keys(result.cachedItems).length : 0;
      
      console.log('Popup: Количество элементов в кеше:', cachedItems);
      
      // Получаем количество отправленных сообщений в Telegram
      const telegramMessages = currentSettings.telegramMessagesSent || 0;
      console.log('Popup: Отправлено сообщений в Telegram:', telegramMessages);
      
      // Обновляем отображение с анимацией (только видимые элементы)
      this.updateCounter(this.cachedItemsSpan, cachedItems);
      this.updateCounter(this.telegramMessagesSpan, telegramMessages);
      this.lastUpdateSpan.textContent = new Date().toLocaleTimeString();
      
      this.statsDiv.style.display = 'block';
      
    } catch (error) {
      console.error('Ошибка обновления статистики:', error);
    }
  }

  // Анимированное обновление счетчика
  updateCounter(element, newValue) {
    const currentValue = parseInt(element.textContent) || 0;
    if (currentValue !== newValue) {
      // Добавляем класс для анимации
      element.classList.add('updated');
      element.textContent = newValue;
      
      // Убираем класс анимации через 300ms
      setTimeout(() => {
        element.classList.remove('updated');
      }, 300);
    } else {
      element.textContent = newValue;
    }
  }
}

// Инициализация при загрузке страницы
let popupController;

document.addEventListener('DOMContentLoaded', () => {
  popupController = new PopupController();
});

// Очистка при закрытии popup
window.addEventListener('beforeunload', () => {
  if (popupController) {
    popupController.stopStatsUpdater();
  }
});
