# Встроенный адаптер MangaDex

## Цель

Добавить в Mochi Reader встроенный источник MangaDex, который подключается одной кнопкой, использует официальный гостевой API без ключей и открывает доступные главы в стандартном manga reader.

## Границы задачи

Входит в задачу:

- новый тип источника `mangadex` в Rust, SQLite и TypeScript;
- подключение источника одной кнопкой в разделе «Источники»;
- поиск произведений через официальный MangaDex API;
- загрузка всех доступных русских и английских глав с пагинацией;
- получение страниц через MangaDex@Home;
- отображение групп переводчиков и атрибуции MangaDex;
- временный дисковый кэш страниц через существующую cache subsystem;
- безопасные ограничения сети, размеров ответа и частоты запросов;
- автоматические тесты и пользовательская документация.

Не входит:

- вход в аккаунт MangaDex;
- синхронизация списков и истории MangaDex;
- загрузка или редактирование произведений;
- обход гостевых лимитов, CAPTCHA или иных ограничений сервиса;
- постоянное офлайн-скачивание глав;
- показы контента с рейтингами `erotica` и `pornographic`.

## Выбранный подход

Адаптер реализуется нативно в Rust как третий `AdapterKind`. HTML-профиль не подходит, потому что MangaDex — динамическое приложение, а его официальный JSON API не соответствует Mochi manifest schema. Локальный gateway не используется, поскольку он добавил бы отдельный процесс, порт и новую точку отказа.

Источник добавляется командой `add_builtin_source("mangadex")`. Команда создаёт или обновляет единственную запись с:

- `name`: `MangaDex`;
- `base_url`: `https://api.mangadex.org/`;
- `adapter_kind`: `mangadex`;
- `capabilities.search`: `true`;
- `capabilities.download`: `false`;
- языками `ru` и `en`;
- рейтингами `safe` и `suggestive`;
- режимом изображений `data-saver`.

Повторное нажатие не создаёт дубликат: существующая запись обновляется через `UNIQUE(base_url, adapter_kind)`.

## API и преобразование данных

### Поиск

Адаптер вызывает `GET /manga` с:

- `title={query}`;
- `limit=20`;
- `offset=(page-1)*20`;
- `includes[]=cover_art`;
- `availableTranslatedLanguage[]=ru` и `en`;
- `contentRating[]=safe` и `suggestive`;
- сортировкой по релевантности.

`data[].id` становится `remoteId`. Заголовок выбирается в порядке `ru`, `en`, `ja-ro`, затем первое непустое значение. Описание выбирается в порядке `ru`, `en`, затем первое непустое. Обложка строится только из relationship `cover_art` и разрешённого origin `https://uploads.mangadex.org`.

`hasNextPage` вычисляется из `offset + data.length < total`.

### Главы

Адаптер вызывает `GET /manga/{remoteId}/feed` с языками `ru` и `en`, `includes[]=scanlation_group`, лимитом 100 и последовательными offset до окончания результата. Максимум — 5 000 глав, что совпадает с внутренним лимитом Mochi Reader.

Главы с непустым `externalUrl` исключаются: встроенный reader не открывает внешний сайт. Для каждой главы формируется человекочитаемый заголовок из тома, номера, названия и языка. Имена relationships типа `scanlation_group` сохраняются в новом необязательном поле `attribution` модели `RemoteChapter` и отображаются рядом с главой.

### Страницы

Адаптер вызывает `GET /at-home/server/{chapterId}`. Из `chapter.hash` и `chapter.dataSaver[]` строятся URL вида `{baseUrl}/data-saver/{hash}/{filename}`. Ответ считается доверенным только после проверки:

- `baseUrl` использует HTTPS;
- host равен `uploads.mangadex.org`, `mangadex.network` или является точным поддоменом `mangadex.network`;
- количество страниц не превышает 2 000;
- имена файлов не содержат пустых или опасных path-компонентов.

Если API не вернул `dataSaver`, адаптер использует `chapter.data[]` и путь `/data/`.

## Сетевая безопасность и лимиты

Все API-вызовы проходят через существующий `SourceHttpClient`: DNS pinning, запрет системного proxy, таймауты, лимит редиректов, MIME/byte limits и SSRF-защита сохраняются.

Для MangaDex вводится API-интервал не менее 250 мс между запросами одного origin. Ответы `429` не повторяются бесконечно: пользователь получает понятную ошибку о лимите и может повторить позже. Адаптер не хранит cookies, токены или учётные данные.

Разрешённые адреса встроены в приложение, а не принимаются от пользователя:

- `https://api.mangadex.org` для JSON;
- `https://uploads.mangadex.org` для обложек;
- `https://mangadex.network` и его HTTPS-поддомены для динамических серверов MangaDex@Home.

Любой другой MangaDex@Home host блокируется безопасно. Проверка suffix требует точку перед `mangadex.network`, поэтому адреса наподобие `mangadex.network.evil.example` не проходят.

## Хранение и миграция

Миграция `0005_mangadex_adapter.sql` пересоздаёт таблицу `sources`, расширяя `CHECK(adapter_kind ...)` значением `mangadex`, и сохраняет существующие записи, их идентификаторы и timestamps.

Config JSON остаётся версионированным объектом. Адаптер принимает только известную schema version и отклоняет повреждённую конфигурацию.

## UI и пользовательский поток

В верхней карточке раздела «Источники» появляется отдельная кнопка «Подключить MangaDex» с состоянием загрузки. После успешной команды карточка MangaDex появляется в списке и открывается стандартной кнопкой «Открыть каталог».

Для карточки показывается label `MangaDex API`. В каталоге и карточке произведения показывается короткая атрибуция `Данные и изображения: MangaDex`. Рядом с каждой главой отображается `Перевод: {attribution}`, если API вернул группу.

Ошибки подключения, rate limit и недоступные главы выводятся через существующие notice/error surfaces. Никакие API-ключи у пользователя не запрашиваются.

## Изменяемые компоненты

- `src-tauri/src/sources/model.rs`: новый `AdapterKind` и attribution глав;
- `src-tauri/src/sources/mangadex.rs`: config, API response types и чистые преобразования;
- `src-tauri/src/sources/service.rs`: dispatch поиска, глав и страниц;
- `src-tauri/src/commands/sources.rs`: команда подключения built-in источника;
- `src-tauri/src/database/source_repository.rs` и migration 0005: хранение нового kind;
- `src-tauri/src/lib.rs`: регистрация команды;
- `src/types/sources.ts` и `src/app/bridge.ts`: frontend contract;
- `src/features/sources/SourcesPage.tsx`: кнопка и label;
- `src/features/sources/SourceCatalogPage.tsx` и `RemoteMangaDetailsPage.tsx`: атрибуция;
- Rust и frontend tests;
- README и документация источников.

## Тестирование

Rust contract tests проверяют:

- преобразование поиска, локализованных названий и обложек;
- пагинацию и исключение внешних глав;
- отображение scanlation group attribution;
- построение data-saver и fallback data URLs;
- блокировку неизвестного CDN origin и повреждённых filenames;
- сохранение и чтение `AdapterKind::Mangadex` после migration;
- dispatch без реального HTTP через тестируемые чистые parsers.

Frontend tests проверяют:

- кнопку «Подключить MangaDex»;
- вызов bridge-команды;
- отсутствие дубликата карточки после повторного подключения;
- label `MangaDex API` и атрибуцию групп.

Финальная проверка включает полный `pnpm lint`, `pnpm test`, `pnpm build`, `cargo fmt --check`, строгий Clippy, `cargo test --all-features` и пересборку NSIS installer.

## Условия использования

В интерфейсе и документации явно указывается MangaDex. Для читаемых глав отображаются группы переводчиков. Mochi Reader не монетизирует MangaDex API, не скрывает removal requests и не пытается обходить ограничения гостевого доступа. Поведение следует актуальной MangaDex Acceptable Usage Policy: <https://gitlab.com/mangadex-pub/mangadex-api-docs/-/blob/main/index.md>.
