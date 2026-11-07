# VibeMarket

Frontend интернет-магазина команды 67. Приложение содержит каталог товаров, страницы входа и регистрации, профиль пользователя, корзину и оформление заказа. Оно загружает каталог и работает с авторизацией через API. Для полного сценария нужен отдельно запущенный backend.

## Требования

- Node.js `^20.19.0`, `^22.13.0` или `>=24`.
- npm.

## Установка

Из корня репозитория выполните:

```sh
npm ci
```

Установка запускает `prepare`: он копирует Handlebars, файлы шрифтов и лицензии в `public/vendor/`.

## Сборка и запуск

```sh
npm run build
npm start
```

`npm start` собирает приложение в `dist/` и запускает локальный HTTP-сервер на `http://localhost:8081`. Сервер раздаёт собранный frontend и проксирует `/api/*` на `http://localhost:8080`. Go-backend запускается отдельно; его совместная работа с frontend здесь не проверяется.

Для разработки используйте две команды в отдельных терминалах:

```sh
npm run watch
npm run preview
```

`watch` пересобирает `dist/` при изменениях, а `preview` раздаёт текущую сборку.

## Проверки

```sh
npm run typecheck
npm run lint
npm run spec:check
```

Webpack собирает клиентские TypeScript ES-модули с Babel, обрабатывает CSS через PostCSS и Autoprefixer и помещает результат в `dist/`. Шаблоны Handlebars и статические ресурсы также копируются в сборку. Service Worker кэширует ресурсы приложения для offline-запуска ранее посещённых маршрутов.

## Документация

- [OpenSpec: спецификации проекта](openspec/README.md).
- [Каталог](openspec/specs/catalog/spec.md), [формы авторизации](openspec/specs/auth-forms/spec.md), [оболочка приложения](openspec/specs/app-shell/spec.md).
