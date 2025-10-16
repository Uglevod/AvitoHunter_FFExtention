// Content script для парсинга элементов Avito

class AvitoParser {
  constructor() {
    this.cachedItems = new Map(); // Кеш элементов по href
  }

  // Инициализация кеша из storage
  async initializeCache() {
    try {
      console.log(`Avito Hunter: Загружаем кеш из storage...`);
      const result = await browser.storage.local.get(['cachedItems']);
      if (result.cachedItems) {
        this.cachedItems = new Map(Object.entries(result.cachedItems));
        console.log(`Avito Hunter: Загружено ${this.cachedItems.size} элементов из кеша`);
        console.log(`Avito Hunter: Ключи кеша:`, Array.from(this.cachedItems.keys()).slice(0, 5), '...');
      } else {
        console.log(`Avito Hunter: Кеш пустой, начинаем с нуля`);
      }
    } catch (error) {
      console.error('Avito Hunter: Ошибка загрузки кеша:', error);
    }
  }

  // Сохранение кеша в storage
  async saveCache() {
    try {
      const cacheObject = Object.fromEntries(this.cachedItems);
      await browser.storage.local.set({ cachedItems: cacheObject });
    } catch (error) {
      console.error('Avito Hunter: Ошибка сохранения кеша:', error);
    }
  }

  // Парсинг всех элементов на странице
  parseItems() {
    const items = [];
    
    // Ищем все элементы с классом iva-item-sliderLink (с учетом суффиксов)
    const itemLinks = document.querySelectorAll('a[class*="iva-item-sliderLink"]');
    
    console.log(`Avito Hunter: Найдено ${itemLinks.length} ссылок на объявления`);
    
    itemLinks.forEach((link, index) => {
      try {
        const item = this.parseItem(link);
        if (item) {
          items.push(item);
          console.log(`Avito Hunter: Элемент ${index + 1}: ${item.title} - ${item.price}₽`);
        } else {
          console.log(`Avito Hunter: Не удалось распарсить элемент ${index + 1}`);
        }
      } catch (error) {
        console.error('Avito Hunter: Ошибка парсинга элемента:', error);
      }
    });

    console.log(`Avito Hunter: Всего распарсено ${items.length} элементов`);
    return items;
  }

  // Парсинг одного элемента
  parseItem(linkElement) {
    if (!linkElement || !linkElement.href) {
      console.log('Avito Hunter: Элемент без href');
      return null;
    }

    // Извлекаем href для использования как ID
    const href = linkElement.getAttribute('href');
    if (!href) {
      console.log('Avito Hunter: Элемент без href атрибута');
      return null;
    }

    // Нормализуем href - убираем системные параметры после "?"
    const normalizedHref = href.split('?')[0];

    // Ищем родительский контейнер с данными - используем более гибкий поиск
    let itemContainer = linkElement.closest('[data-item-id]');
    
    // Если не найден контейнер с data-item-id, ищем по классу iva-item-root
    if (!itemContainer) {
      itemContainer = linkElement.closest('[class*="iva-item-root"]');
    }
    
    // Если все еще не найден, ищем ближайший контейнер с классом iva-item
    if (!itemContainer) {
      itemContainer = linkElement.closest('[class*="iva-item-"]');
    }
    
    if (!itemContainer) {
      console.log('Avito Hunter: Не найден контейнер для href:', href);
      return null;
    }

    // Извлекаем описание из meta тега
    const descriptionMeta = itemContainer.querySelector('meta[itemprop="description"]');
    const description = descriptionMeta ? descriptionMeta.getAttribute('content') : '';

    // Извлекаем цену из meta тега
    const priceMeta = itemContainer.querySelector('meta[itemprop="price"]');
    const price = priceMeta ? priceMeta.getAttribute('content') : '';

    // Извлекаем название - используем более гибкий поиск
    let titleElement = itemContainer.querySelector('h2[itemprop="name"] a');
    if (!titleElement) {
      // Пробуем найти заголовок по классу iva-item-title
      titleElement = itemContainer.querySelector('[class*="iva-item-title"] a');
    }
    if (!titleElement) {
      // Пробуем найти заголовок по классу title
      titleElement = itemContainer.querySelector('[class*="title"] a');
    }
    const title = titleElement ? titleElement.textContent.trim() : '';

    // Извлекаем URL (используем нормализованный href)
    const url = normalizedHref.startsWith('http') ? normalizedHref : `https://www.avito.ru${normalizedHref}`;

    console.log(`Avito Hunter: Парсинг элемента - original href: ${href}, normalized: ${normalizedHref}, title: ${title}, price: ${price}, description: ${description.substring(0, 50)}...`);

    return {
      id: normalizedHref, // Используем нормализованный href как уникальный ID
      title: title,
      description: description,
      price: price,
      url: normalizedHref,
      originalHref: href, // Сохраняем оригинальный href для отладки
      timestamp: Date.now()
    };
  }

  // Проверка на новые элементы
  async checkForNewItems() {
    const currentItems = this.parseItems();
    const newItems = [];

    console.log(`Avito Hunter: Проверка новых элементов. Текущих: ${currentItems.length}, в кеше: ${this.cachedItems.size}`);

    for (const item of currentItems) {
      if (!this.cachedItems.has(item.id)) {
        // Новый элемент
        newItems.push(item);
        this.cachedItems.set(item.id, item);
        console.log(`Avito Hunter: Найден новый элемент: ${item.title} (ID: ${item.id})`);
      } else {
        console.log(`Avito Hunter: Элемент уже в кеше: ${item.title} (ID: ${item.id})`);
      }
    }

    // Сохраняем обновленный кеш
    if (newItems.length > 0) {
      await this.saveCache();
      console.log(`Avito Hunter: Кеш обновлен. Новых элементов: ${newItems.length}, всего в кеше: ${this.cachedItems.size}`);
      console.log(`Avito Hunter: Новые элементы будут отправлены в Telegram:`, newItems.map(item => item.title));
    } else {
      console.log(`Avito Hunter: Новых элементов не найдено, уведомления не отправляются`);
    }

    return newItems;
  }

  // Инициализация отслеживания при загрузке страницы
  async initializeTracking() {
    // Сначала загружаем кеш из storage
    await this.initializeCache();
    
    // Парсим и кешируем все элементы при первой загрузке
    const items = this.parseItems();
    
    let addedCount = 0;
    const newItems = [];
    
    console.log(`Avito Hunter: Инициализация отслеживания. Найдено элементов: ${items.length}, в кеше: ${this.cachedItems.size}`);
    
    for (const item of items) {
      if (!this.cachedItems.has(item.id)) {
        this.cachedItems.set(item.id, item);
        newItems.push(item);
        addedCount++;
        console.log(`Avito Hunter: Добавлен в кеш: ${item.title} (ID: ${item.id})`);
      } else {
        console.log(`Avito Hunter: Уже в кеше: ${item.title} (ID: ${item.id})`);
      }
    }

    await this.saveCache();
    console.log(`Avito Hunter: Инициализировано отслеживание для ${items.length} элементов. Добавлено новых: ${addedCount}, всего в кеше: ${this.cachedItems.size}`);

    // Уведомляем background script о готовности и новых элементах
    // Отправляем ВСЕ новые элементы при ЛЮБОЙ загрузке
    try {
      browser.runtime.sendMessage({
        action: 'pageReady',
        itemCount: items.length,
        newItems: newItems // Отправляем новые элементы для уведомлений
      }).catch(error => {
        console.error('Avito Hunter: Ошибка отправки сообщения в background:', error);
      });
    } catch (error) {
      console.error('Avito Hunter: Ошибка отправки сообщения в background:', error);
    }
  }
}

// Инициализация парсера
const avitoParser = new AvitoParser();

// Обработка сообщений от background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'parseAndCheck':
      avitoParser.checkForNewItems().then(newItems => {
        console.log(`Avito Hunter: Content script возвращает ${newItems.length} новых элементов`);
        sendResponse({ newItems: newItems });
      }).catch(error => {
        console.error('Avito Hunter: Ошибка в checkForNewItems:', error);
        sendResponse({ newItems: [] });
      });
      return true; // Асинхронный ответ
      
    case 'getItemCount':
      const items = avitoParser.parseItems();
      sendResponse({ itemCount: items.length });
      break;
  }
});

// Инициализация при загрузке страницы
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    avitoParser.initializeTracking();
  });
} else {
  avitoParser.initializeTracking();
}

// Дополнительная инициализация через небольшую задержку
// для случаев когда страница загружается динамически
setTimeout(() => {
  avitoParser.initializeTracking();
}, 2000);
