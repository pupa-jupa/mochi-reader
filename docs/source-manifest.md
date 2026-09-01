# Mochi Source Manifest v1

Mochi Source Manifest — декларативный JSON-контракт для публичного JSON/REST-каталога манги. Это не JavaScript plugin: приложение не загружает и не исполняет код источника, не использует `eval`, `Function`, cookies браузера или обход ограничений сайта.

Готовый пример: [`examples/source-manifest.example.json`](../examples/source-manifest.example.json). Машиночитаемый контракт: [`schemas/mochi-source-manifest-v1.schema.json`](../schemas/mochi-source-manifest-v1.schema.json).

## Подключение

Источник публикует manifest по адресу:

```text
https://manga.example/.well-known/mochi-reader.json
```

В Mochi Reader откройте «Каталоги», выберите «Добавить по URL» и укажите `https://manga.example`. Reader загружает manifest, проверяет структуру и сетевую политику, после чего сохраняет только нормализованный декларативный config.

## Поля верхнего уровня

| Поле | Назначение |
| --- | --- |
| `schemaVersion` | Для v1 всегда `1`. |
| `id` | Стабильный ID из 3–100 ASCII-символов: буквы, цифры, `.`, `_`, `-`. |
| `name` | Отображаемое имя длиной 1–120 символов. |
| `kind` | В v1 реализовано только `manga`. |
| `allowedDomains` | До восьми дополнительных HTTPS origins только для обложек и страниц. API endpoints всегда остаются на `baseUrl` origin. |
| `baseUrl` | HTTPS URL того же origin, на котором опубликован manifest. |
| `endpoints` | URL templates для поиска, деталей, глав и страниц. |
| `pagination` | В v1 — `{ "kind": "page", "start": 1 }`. |
| `mappings` | Безопасные пути из JSON responses в модель Reader. |
| `formats` | В v1 честно поддерживается `remote_manga`. |
| `capabilities` | `search` должен быть `true`; `download` включает явную офлайн-загрузку глав. |

`allowedDomains` содержит origins, а не произвольные URL: `https://cdn.example` допустим, `https://cdn.example/images` — нет. HTTP, credentials, query, fragment, localhost и private-network адреса блокируются в production.

## Endpoints и placeholders

```json
{
  "search": "/v1/search?q={query}&page={page}",
  "details": "/v1/manga/{id}",
  "chapters": "/v1/manga/{id}/chapters",
  "pages": "/v1/chapter/{id}/pages"
}
```

Reader сам URL-encode значения. Разрешены только placeholders, соответствующие endpoint:

- `search`: `{query}`, `{page}`;
- `details`, `chapters`, `pages`: `{id}`.

Неизвестные placeholders, cross-origin endpoints и templates длиннее 2048 символов отклоняются. `details` зарезервирован для расширенной карточки; текущий manga flow получает основную карточку из search response и использует `chapters`/`pages`.

## Безопасные mappings

Mappings используют ограниченный JSON path синтаксис:

```text
$
$.field
$.field.nestedField
```

Нет recursive descent, filters, predicates, expressions, function calls или array scripting. `items` должен указывать на массив; остальные пути внутри `search`, `chapters` и `pages` вычисляются относительно одного элемента массива. Отсутствующие optional mappings дают `null`, но обязательные `id`, `title` и URL приводят к понятной ошибке источника.

Пример search response для manifest из репозитория:

```json
{
  "payload": {
    "results": [
      {
        "slug": "moon-letters",
        "name": "Moon Letters",
        "links": { "details": "/manga/moon-letters" },
        "art": { "cover": "https://cdn.manga.example/moon.webp" },
        "synopsis": "A quiet story"
      }
    ],
    "hasMore": false
  }
}
```

## Response requirements

- JSON должен быть UTF-8 с JSON Content-Type;
- search response — не больше 4 МБ и 200 результатов на страницу;
- chapters — не больше 4 МБ и 5000 записей;
- pages — не больше 4 МБ и 2000 изображений;
- обязательные IDs и titles не могут быть пустыми;
- API URLs должны оставаться на `baseUrl` origin;
- image URLs могут использовать только `baseUrl` или origin из `allowedDomains`.

## Validation и совместимость

JSON Schema предназначена для редакторов, CI и авторов источников. В приложении Rust-валидатор повторяет структурные и семантические ограничения: запрещает неизвестные поля, проверяет версию, ID, URL policy, endpoints, placeholders, pagination, mappings, formats и capabilities до первого запроса каталога.

Ранние development manifests без `id`, `kind`, `baseUrl`, `pagination`, `mappings` и `formats` пока читаются как legacy-совместимость. Новые источники должны соответствовать полному v1 schema; legacy-форма не будет расширяться.

## Что manifest принципиально не умеет

- выполнять JavaScript или WASM источника;
- импортировать cookies или браузерную сессию;
- обходить login, CAPTCHA, anti-bot, paywall или DRM;
- отправлять POST/PUT/DELETE запросы;
- читать локальные файлы;
- обращаться к незаявленным сетевым origins.

Если API не выражается этим контрактом, нужен встроенный Rust adapter с отдельным review и contract tests.
