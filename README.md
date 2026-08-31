# Mochi Reader ♡

Уютное локальное Windows-приложение для чтения книг и манги. Интерфейс — React/TypeScript, desktop-слой — Tauri/Rust, постоянные данные — SQLite. Регистрация и облачный аккаунт не нужны.

## Возможности

- импорт одного или нескольких файлов, папок и drag-and-drop;
- библиотека, поиск, статусы, избранное, коллекции и ручное редактирование метаданных;
- перепривязка перемещённого исходного файла без потери прогресса;
- текстовый reader с оглавлением, поиском, закладками, настройками текста и полноэкранным режимом;
- PDF reader и manga reader с вертикальным, одиночным, двойным, LTR и RTL-режимами;
- автоматическое сохранение прогресса и история чтения;
- встроенный MangaDex API и декларативные онлайн-источники манги, кэш, предзагрузка и разрешённое источником офлайн-сохранение глав;
- темы Sakura Pink, Strawberry Milk и Night Sakura, уменьшение анимаций и оригинальный mascot Mochi;
- локальные ротируемые логи и обезличенная диагностическая сводка.

## Реально поддерживаемые форматы

| Формат | Чтение |
| --- | --- |
| EPUB | Да, текст и главы |
| FB2 | Да, текст и главы |
| TXT | Да |
| HTML / HTM | Да, после sanitise |
| Markdown | Да, после безопасного преобразования |
| PDF | Да, PDF reader |
| CBZ | Да |
| ZIP с изображениями | Да |
| Папка JPG/JPEG/PNG/WEBP/AVIF | Да, как одна манга |
| Отдельное изображение | Да |
| CBR | Распознаётся, но встроенное чтение RAR пока не реализовано; приложение показывает понятную ошибку |
| MOBI / AZW3 / DJVU | Нет; приложение не выдаёт их за поддерживаемые |

HTML из книг не исполняет JavaScript: скрипты, iframe, event handlers и опасные URL удаляются.

## Development

Требования для Windows:

- Node.js 22+ и Corepack/pnpm;
- Rust stable 1.88+ с target `x86_64-pc-windows-msvc`;
- Microsoft C++ Build Tools (Desktop development with C++);
- Microsoft Edge WebView2 Runtime.

```powershell
corepack enable
pnpm install
pnpm tauri dev
```

Проверки:

```powershell
pnpm lint
pnpm test
pnpm build
Set-Location src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

## Build

```powershell
pnpm tauri build
```

Windows NSIS installer появляется в `src-tauri/target/release/bundle/nsis/`, самостоятельный `.exe` — в `src-tauri/target/release/`.

## Данные и файлы

По умолчанию Mochi Reader хранит ссылку на исходный файл и не копирует книгу. Удаление записи из библиотеки также не удаляет оригинал. SQLite, кэш, логи и состояние окна находятся в системных каталогах приложения Tauri под идентификатором `app.mochireader.desktop`.

## Manga sources

Есть встроенный источник и два расширяемых адаптера:

1. MangaDex API — подключается одной кнопкой «Подключить MangaDex» на странице «Источники», без аккаунта и API-ключа;
2. manifest adapter — сайт публикует `/.well-known/mochi-reader.json` и JSON endpoints;
3. generic HTML adapter — пользователь импортирует декларативный JSON-профиль с CSS selectors.

MangaDex показывает только произведения рейтингов `safe` и `suggestive`, запрашивает русские и английские главы и использует экономичные изображения MangaDex@Home. Постоянная офлайн-загрузка для него отключена; страницы остаются только во временном кэше.

Ни один вариант не выполняет код источника. Подробная схема, ответы endpoints и пример профиля: [docs/manga-source-adapters.md](docs/manga-source-adapters.md) и [examples/sources/generic-example.json](examples/sources/generic-example.json).

## Документация

- [Безопасность и приватность](docs/privacy-and-security.md)
- [Диагностика и частые проблемы](docs/troubleshooting.md)
- [Архитектура источников](docs/manga-source-adapters.md)
- [Дизайн-система](design-system/mochi-reader/MASTER.md)

## Ассеты

Оригинальный mascot — кремовый mochi-кролик в круглых малиновых очках. Все позы сгенерированы от одного app-icon reference в единой мягкой gouache/paper стилистике. Рядом с прозрачными версиями сохранены исходные `*-chroma.png` на чистом `#00FF00`; воспроизводимый способ удаления фона описан в [src/assets/mascot/README.md](src/assets/mascot/README.md).
