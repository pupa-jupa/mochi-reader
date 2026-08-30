# Mochi Reader — design specification

**Дата:** 2026-08-30

**Статус:** утверждено пользователем

**Целевая платформа:** Windows 10/11 x64
**Рабочее название:** Mochi Reader ♡

## 1. Цель продукта

Mochi Reader — локальное desktop-приложение для чтения электронных книг и манги. Оно объединяет библиотеку, два специализированных reader-режима, историю, закладки, коллекции и безопасно расширяемые онлайн-источники. Приложение не требует аккаунта, не загружает пользовательскую библиотеку в облако и сохраняет всё состояние между запусками.

Ключевая эмоция — «уютное место, куда хочется вернуться вечером читать». Визуальный язык — мягкий японский editorial-kawaii: пастельная сакура, молочно-белые поверхности, тёмная Night Sakura, крупные скругления, неброские декоративные мотивы и оригинальный mascot.

## 2. Границы первого production-релиза

Первый релиз предоставляет реальные рабочие вертикальные сценарии:

1. Первый запуск и onboarding с выбором темы и папки библиотеки.
2. Импорт одиночных и нескольких файлов, папок и drag-and-drop.
3. Постоянная SQLite-библиотека, метаданные, коллекции, статусы, избранное и поиск.
4. Чтение EPUB, FB2, TXT, HTML/HTM и Markdown в текстовом reader.
5. Чтение PDF в PDF-режиме.
6. Чтение CBZ, CBR, ZIP с изображениями, папок изображений и одиночных изображений в manga reader.
7. Прогресс, история, закладки и заметки с автосохранением.
8. Подключение совместимого онлайн-источника по URL через декларативный manifest либо Generic HTML Adapter.
9. Чтение онлайн-глав в стандартном manga reader, предзагрузка и ограничиваемый disk cache.
10. Настройки, три темы, уменьшение анимаций, диагностика и лог-файлы.
11. Сборка Windows `.exe` и NSIS/MSI installer через Tauri.

MOBI, AZW3 и DJVU не заявляются как встроенно поддерживаемые форматы. При их импорте приложение показывает понятное сообщение и предлагает настроенный пользователем путь к Calibre `ebook-convert`; после успешной конвертации полученный EPUB/PDF импортируется как отдельная локальная копия. Без доступного конвертера интерфейс не обещает чтение этих форматов.

## 3. Архитектурный подход

Используется модульный монолит:

- **Tauri 2 / Rust** владеет базой данных, файловой системой, импортом, парсерами, сетевыми запросами, кэшем, логами и системными интеграциями.
- **React / TypeScript** владеет отображением, навигацией, UI-состоянием, анимациями, reader-представлениями и доступностью.
- **Typed IPC boundary** содержит небольшие DTO и команды. Frontend не выполняет SQL и не читает произвольные пути напрямую.
- **SQLite** хранит нормализованные данные, миграции и FTS5-индексы.
- Тяжёлые операции выполняются в `spawn_blocking`/фоновых задачах и публикуют события прогресса. UI не ожидает синхронного чтения больших файлов.

Архитектура остаётся одним устанавливаемым приложением; отдельный sidecar не используется.

## 4. Структура репозитория

```text
src/
  app/                 # bootstrap, router, providers, typed bridge
  components/          # общие UI primitives и композиционные компоненты
  features/
    onboarding/
    dashboard/
    library/
    details/
    reader/
    manga-reader/
    bookmarks/
    history/
    collections/
    sources/
    settings/
  hooks/
  stores/              # независимые Zustand stores
  styles/              # theme tokens, typography, motion
  types/               # shared frontend DTO types
  utils/
src-tauri/
  src/
    app_state.rs
    commands/           # тонкие Tauri command handlers
    database/           # connection, migrations, repositories, FTS
    domain/             # DTO, enums, validation and errors
    import/             # detection, batch/folder import pipeline
    parsers/            # epub, fb2, text, html, markdown, pdf metadata
    manga/              # archives, natural sort, page manifests
    sources/            # adapter trait, manifest/html adapters, HTTP policy
    cache/               # memory/disk cache, quotas and eviction
    protocol/            # validated local content protocol
    diagnostics/         # logs and diagnostic bundle
  migrations/
  capabilities/
  icons/
tests/
  fixtures/
  e2e/
```

Файлы группируются по ответственности. Команды не содержат SQL или парсинг; repositories не знают про Tauri; frontend feature-модули общаются с backend только через bridge.

## 5. Доменная модель и SQLite

Основные таблицы:

- `works`: книга/манга, названия, автор, описание, тип, формат, путь, fingerprint, обложка, статус, favorite, timestamps, missing-file flag.
- `chapters`: произведение, индекс, название, source locator, word/page count.
- `manga_pages`: глава, natural index, source locator, dimensions и media type.
- `reading_progress`: work, chapter, page/offset, percent, reader mode, updated timestamp.
- `reading_sessions`: start/end, duration, pages/chapters read.
- `bookmarks`: work/chapter/page/offset, excerpt, note, created timestamp.
- `history`: work, chapter, opened/closed timestamps.
- `collections`, `collection_items`.
- `tags`, `work_tags`.
- `sources`: URL, adapter kind, enabled flag, validated config, capabilities.
- `source_manga`, `source_chapters`: удалённые идентификаторы и синхронизированные метаданные.
- `downloads`: состояние офлайн-загрузки главы.
- `cache_entries`: key, owner, path, byte size, last access, pinned flag.
- `settings`: versioned JSON values для небольших пользовательских настроек.
- `schema_migrations`.
- FTS5 virtual tables для произведений, авторов, тегов, глав и нормализованного текста книг.

Все destructive-операции используют транзакции. Удаление из библиотеки удаляет только записи и внутренний кэш. Удаление исходного файла — отдельная команда с отдельным системным подтверждением.

## 6. Импорт и распознавание

Pipeline импорта:

1. Dialog/drop event передаёт выбранные пути Rust-команде.
2. Backend канонизирует пути, проверяет существование, размер и тип объекта.
3. Формат определяется по signature/magic bytes, контейнеру и только затем расширению.
4. Папка рекурсивно сканируется с ограниченной параллельностью и отменой.
5. Парсер возвращает нормализованный `ImportCandidate`.
6. Fingerprint предотвращает случайные дубликаты; пользователь может сохранить разные издания.
7. Обложка и thumbnail создаются в app cache.
8. Work, chapters и search index записываются одной транзакцией.
9. Frontend получает progress events и индивидуальные понятные ошибки.

Для папки изображений natural sort сравнивает числовые сегменты, поэтому `1, 2, 3, 10` сортируются корректно. Архивы защищены лимитами числа entries, суммарного распакованного размера, коэффициента сжатия и path traversal.

## 7. Text Book Reader

EPUB распаковывается только в память/контролируемый cache; OPF/spine/TOC преобразуются в нормализованные главы. FB2 разбирается как XML. Markdown преобразуется в HTML. HTML/EPUB-контент проходит backend-sanitization и повторную DOMPurify-sanitization перед отображением.

Reader использует:

- CSS column pagination для экранного режима;
- отдельный continuous mode для длинного текста;
- chapter navigation и TOC;
- полнотекстовый поиск с переходом к совпадению;
- выбор текста, копирование, заметку и закладку;
- настройки семейства/размера шрифта, line-height, ширины, выравнивания и темы;
- auto-hide toolbar, fullscreen и горячие клавиши;
- debounce-autosave и немедленный flush при смене главы/закрытии.

Позиция хранится как chapter id + устойчивый text character offset + процент. Reader восстанавливает ближайший допустимый offset, если содержимое было переиндексировано.

PDF отображается через `pdfjs-dist` из байтов, предоставленных проверенным локальным content protocol с поддержкой range requests. PDF JavaScript, вложения и launch actions не выполняются.

## 8. Manga Reader

Backend предоставляет `MangaManifest` со списком валидированных page URLs внутреннего protocol. Локальные архивы распаковывают только запрошенные/ближайшие страницы в ограниченный cache.

Режимы:

- vertical/webtoon с виртуализацией;
- single page;
- double page;
- RTL/LTR навигация;
- fit width, fit height и ручной zoom;
- fullscreen и скрываемый chrome.

Около текущей позиции frontend держит небольшое окно object URLs, а backend предзагружает следующие 3 страницы. При смене главы старые object URLs освобождаются. Прогресс сохраняется по стабильному chapter id и page index.

## 9. Онлайн-источники

`MangaSourceAdapter` — Rust trait:

```rust
#[async_trait]
pub trait MangaSourceAdapter: Send + Sync {
    async fn probe(&self, base_url: &Url) -> Result<SourceDescriptor, AppError>;
    async fn search(&self, source: &SourceConfig, query: &str, page: u32) -> Result<SearchPage, AppError>;
    async fn manga_info(&self, source: &SourceConfig, manga_url: &Url) -> Result<RemoteManga, AppError>;
    async fn chapters(&self, source: &SourceConfig, manga_url: &Url) -> Result<Vec<RemoteChapter>, AppError>;
    async fn chapter_pages(&self, source: &SourceConfig, chapter_url: &Url) -> Result<Vec<RemotePage>, AppError>;
}
```

Первый релиз содержит:

- **Manifest Adapter**: ищет `/.well-known/mochi-reader.json`, проверяет JSON Schema, same-origin URL templates и заявленные download/cache permissions.
- **Generic HTML Adapter**: пользователь импортирует декларативный JSON-профиль с CSS selectors для поиска, карточки, глав и изображений. Профиль не содержит JavaScript.
- **Fixture Adapter**: локальный тестовый источник для автоматических тестов и демонстрации SDK; он не показывается как внешний каталог пользователю.

При добавлении одного URL без manifest приложение выполняет безопасный probe и сообщает, что для сайта нужен адаптер. Оно не угадывает произвольную структуру сайта и не обходит login, CAPTCHA, DRM, paywall или robots/access restrictions.

HTTP-клиент применяет HTTPS-by-default, allowlist домена источника, redirect limits, timeout, response-size limits, media MIME validation, rate limiting и идентифицируемый User-Agent. Credentials и cookies не импортируются из браузера.

## 10. Cache и offline

Disk cache расположен в app cache directory, индексируется SQLite и использует LRU eviction. Квота выбирается из 500 MB, 1 GB, 2 GB, 5 GB и unlimited. Активно читаемая и явно скачанная глава pinned и не удаляется eviction-процессом.

Ключ cache включает source id, canonical URL и validator (`ETag`/`Last-Modified`). Запись происходит через временный файл + atomic rename. Очистка всего кэша и кэша произведения выполняется реальными командами и обновляет индекс транзакционно.

Offline download доступен только если adapter объявляет `allow_download: true`.

## 11. UI и визуальная система

Основная композиция — компактный collapsible sidebar, спокойный top bar и широкая content canvas. Это reader, а не dashboard: панели появляются только в контексте действия.

Темы задаются CSS custom properties:

- **Sakura Pink:** `#FFD8D1`, `#FFE5E1`, `#FFF2F0`, `#F9BFC0`, `#F3AEB4`, `#FFFFFF` с тёплым чернильным текстом.
- **Strawberry Milk:** почти белая основа, розовый только как акцент.
- **Night Sakura:** графитово-сливовый фон, приглушённая сакура, достаточный контраст.

Типографика использует локально поставляемую пару выразительного display-serif и читабельного variable sans; приложение не зависит от Google Fonts во время работы. UI масштабируется от 80% до 130%.

Motion tokens: 120–220 ms для UI, один мягкий spring для cards/modals, page transition без долгих перемещений. `prefers-reduced-motion` и настройка «Уменьшить анимации» отключают transform-анимации и сокращают fades.

ImageGen создаёт оригинального нейтрального mascot — маленького mochi-кролика-библиотекаря — и связанные empty-state иллюстрации. В ассетах нет персонажей существующих франшиз. Mascot можно полностью отключить.

## 12. Состояние frontend

Zustand разделён на stores:

- `libraryStore`: запросы, фильтры, selection и import jobs;
- `readerStore`: открытая книга, позиция и reader preferences;
- `mangaStore`: chapter/page, mode, direction и zoom;
- `settingsStore`: theme, accessibility и persistent preferences;
- `sourceStore`: sources, remote catalog и downloads;
- `uiStore`: sidebar, modals, toasts и transient chrome.

SQLite остаётся source of truth. Stores не дублируют весь каталог и используют пагинацию. Длинные grids/lists виртуализируются.

## 13. Ошибки, логи и диагностика

Rust возвращает serializable `AppErrorPayload { code, user_message, detail, recoverable }`. UI показывает локализованное сообщение и, по запросу, технические подробности. Panic/stack trace/raw JSON не попадают в обычный интерфейс.

Rotating logs хранятся в app log directory без содержимого книг, auth headers и полного query string. Настройки содержат работающие действия «Открыть папку логов» и «Скопировать диагностическую информацию».

Повреждённый/отсутствующий файл помечается в библиотеке. Пользователь может выбрать новый путь; fingerprint подтверждает, что это то же произведение, либо явно принять замену.

## 14. Безопасность

- Строгий Tauri CSP без remote scripts.
- Минимальные capabilities; произвольный frontend filesystem/network access отсутствует.
- Все local content URLs содержат opaque id, разрешаемый через DB/cache registry, а не пользовательский path.
- HTML sanitization удаляет scripts, iframes, forms, event handlers, unsafe URLs, external styles и active SVG.
- Архивы проверяются от traversal, zip bombs и чрезмерного размера.
- Source adapters не исполняют код и ограничены своим origin.
- SQL всегда параметризован.
- Исходные пользовательские файлы открываются read-only, пока пользователь отдельно не подтвердит удаление.

## 15. Производительность

- Библиотечные запросы пагинируются и индексируются; target — 5 000 works без полного чтения в память.
- Grid/list virtualization и cached thumbnails.
- Ограниченная очередь metadata jobs; не более числа CPU cores и не более двух тяжёлых archive/PDF jobs одновременно.
- Range/chunk access для PDF и manga pages.
- Debounced progress updates с transactional flush.
- Предзагрузка только ближайших ресурсов и отмена при navigation.

## 16. Тестирование

### Rust

- unit tests для natural sort, detection, sanitization, archive limits, adapter validation, cache eviction и progress math;
- repository integration tests на временной SQLite DB с реальными migrations;
- parser fixture tests для каждого заявленного формата;
- HTTP adapter tests через локальный mock server без внешней сети.

### Frontend

- Vitest + Testing Library для stores, bridge adapters и ключевых компонентов;
- axe assertions для критических экранов;
- tests горячих клавиш, RTL navigation и autosave behavior;
- Playwright smoke flows для onboarding, import, resume, bookmark, theme and source profile.

### Build

- `pnpm lint`, `pnpm test`, `pnpm build`;
- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`;
- `pnpm tauri build` на Windows;
- ручная визуальная проверка всех тем и reduced-motion.

## 17. Этапы поставки

1. Foundation: toolchain, Tauri shell, design tokens, typed bridge, DB migrations, errors and tests.
2. Library: imports, metadata, thumbnails, search, dashboard, details, collections and file recovery.
3. Readers: text/PDF reader, manga reader, progress, history, bookmarks, notes and shortcuts.
4. Sources: adapter engine, profiles, catalog, chapter cache, download and offline reading.
5. Productization: onboarding, settings, diagnostics, mascot assets, accessibility, performance, installer and README.

Каждый этап заканчивается рабочим приложением, тестами TypeScript/Rust и сборкой frontend. Финальный этап дополнительно заканчивается Tauri production installer.

## 18. Критерии готовности

Приложение считается готовым, когда:

- чистая установка проходит onboarding и повторный запуск не показывает его снова;
- каждый заявленный формат открывается на соответствующем fixture и реально читается;
- импорт, поиск, категории, коллекции, favorite и карточка произведения сохраняются после перезапуска;
- reader восстанавливает точную главу/страницу и близкую устойчивую текстовую позицию;
- bookmarks/history/settings/cache/source configs сохраняются;
- все видимые основные кнопки выполняют действие либо недоступны с явным объяснением причины;
- отсутствующий и повреждённый файл не приводит к crash;
- source adapter не выходит за разрешённый origin и не выполняет чужой код;
- automated checks и Windows production build завершаются без ошибок;
- README документирует запуск, сборку, реально поддерживаемые форматы и создание адаптера.
