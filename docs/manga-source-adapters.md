# MangaSourceAdapter

Mochi Reader не пытается универсально «угадать» произвольный сайт. Доступны встроенный нативный MangaDex adapter и два декларативных контракта. Все они реализуют один поток: `searchManga → getChapters → getChapterPages → standard Manga Reader`.

## Общие ограничения

- production URL только `https://`;
- основной HTML/JSON остаётся в origin источника;
- до 8 дополнительных HTTPS origins можно явно перечислить только для изображений;
- логины, пароли, query и fragment в base URL запрещены;
- loopback, private, link-local, multicast и служебные адреса блокируются (localhost разрешён только debug-сборке);
- DNS разрешается до запроса и закрепляется в HTTP client; системные proxy отключены;
- не более 3 redirects, только внутри разрешённого origin;
- connect timeout 5 секунд, общий timeout 15 секунд, минимум 250 мс между запросами одного origin;
- лимиты: manifest 1 МБ, каталог JSON/HTML 4 МБ, HTML произведения 8 МБ, HTML главы 16 МБ, изображение 32 МБ;
- JavaScript, CAPTCHA, авторизация, paywall и DRM не поддерживаются и не обходятся.

## Встроенный MangaDex adapter

На странице «Источники» нажмите «Подключить MangaDex». Приложение создаст единственную запись `MangaDex API`; повторное подключение обновляет её, а не создаёт дубликат. Аккаунт, токен и API-ключ не нужны.

Встроенный Rust adapter обращается только к официальному `https://api.mangadex.org` и:

- ищет произведения с рейтингами `safe` и `suggestive`;
- выбирает русские названия и описания перед английскими;
- запрашивает русские и английские главы через `/manga/{id}/feed`;
- не открывает главы с внешним `externalUrl`;
- показывает scanlation group как `Перевод: …`;
- получает список страниц через `/at-home/server/{chapterId}` и предпочитает `data-saver`;
- принимает изображения только с `uploads.mangadex.org` или точных HTTPS-поддоменов `mangadex.network`;
- не выполняет автоматические повторы после HTTP 429.

Постоянная офлайн-загрузка MangaDex-глав отключена. Открытые страницы могут находиться во временном дисковом кэше и удаляются обычной очисткой кэша.

## Декларативный вариант 1: Mochi Source Manifest v1

Канонический контракт, JSON Schema, безопасный mapping syntax и полный пример находятся в [`docs/source-manifest.md`](source-manifest.md). Ниже показана ранняя компактная форма, которую Reader пока принимает только для обратной совместимости; новые источники должны использовать полный Mochi Source Manifest v1.

При добавлении `https://manga.example` приложение читает:

```text
https://manga.example/.well-known/mochi-reader.json
```

Пример manifest:

```json
{
  "schemaVersion": 1,
  "name": "Example Manga",
  "imageOrigins": ["https://cdn.example"],
  "endpoints": {
    "search": "/api/search?q={query}&page={page}",
    "manga": "/api/manga/{id}",
    "chapters": "/api/manga/{id}/chapters",
    "pages": "/api/chapter/{id}/pages"
  },
  "capabilities": {
    "download": false
  }
}
```

`{query}`, `{page}` и `{id}` URL-encode выполняет приложение. Поле `manga` зарезервировано для расширенного metadata endpoint; текущий reader использует объект поиска и endpoints глав/страниц.

Ответ поиска:

```json
{
  "items": [
    {
      "id": "moon-letters",
      "title": "Moon Letters",
      "url": "/manga/moon-letters",
      "coverUrl": "https://cdn.example/covers/moon.webp",
      "summary": "A quiet story"
    }
  ],
  "hasNextPage": false
}
```

Ответ списка глав:

```json
{
  "items": [
    { "id": "moon-1", "title": "Chapter 1", "url": "/chapter/moon-1" }
  ]
}
```

Ответ списка страниц:

```json
{
  "pages": [
    { "url": "https://cdn.example/moon-1/001.webp", "label": "1" },
    { "url": "https://cdn.example/moon-1/002.webp", "label": "2" }
  ]
}
```

Все responses должны быть UTF-8 и иметь корректный `Content-Type`. Неизвестные поля отклоняются, чтобы опечатка в профиле не создавала молчаливую ошибку.

## Декларативный вариант 2: generic HTML adapter

Если сайт не публикует manifest, в интерфейсе можно вставить JSON-профиль. Профиль ничего не исполняет: он задаёт только пути и CSS selectors.

```json
{
  "schemaVersion": 1,
  "name": "Example HTML Catalog",
  "baseUrl": "https://manga.example",
  "searchPath": "/search?q={query}&page={page}",
  "imageOrigins": ["https://cdn.example"],
  "allowDownload": false,
  "selectors": {
    "searchItems": ".catalog-card",
    "title": ".catalog-card__title",
    "mangaUrl": "a.catalog-card__link@href",
    "cover": "img.catalog-card__cover@src",
    "summary": ".catalog-card__summary",
    "chapterItems": ".chapter-list li.chapter",
    "chapterTitle": ".chapter__title",
    "chapterUrl": "a.chapter__link@href",
    "pageImages": ".reader img.page@src",
    "nextPage": "a.pagination__next"
  }
}
```

Синтаксис `selector@attribute` извлекает attribute; без `@attribute` используется текст элемента. `searchItems`, `title`, `mangaUrl`, `chapterItems`, `chapterUrl` и `pageImages` обязательны. `cover`, `summary`, `chapterTitle`, `nextPage` необязательны.

Готовый редактируемый пример находится в `examples/sources/generic-example.json`.

## Офлайн-главы и кэш

Кнопка скачивания доступна только при `capabilities.download: true` или `allowDownload: true`. Скачанные страницы закрепляются и не удаляются обычной очисткой временного кэша. При удалении источника его записи и файлы кэша удаляются вместе. Изображения хранятся с SHA-256 key, записываются через временный файл и atomic rename.

## Добавление нового программного adapter kind

Если декларативных вариантов недостаточно, расширение делается в Rust без загрузки кода с сайта:

1. добавить kind в `src-tauri/src/sources/model.rs`;
2. реализовать validation и parser в `src-tauri/src/sources/`;
3. подключить dispatch в `service.rs`;
4. добавить contract tests в `src-tauri/tests/source_core.rs`;
5. сохранить те же SSRF, timeout, size и Content-Type ограничения.

Адаптер не должен хранить credentials, выполнять JS сайта или обходить ограничения доступа.
