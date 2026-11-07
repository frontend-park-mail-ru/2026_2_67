# VibeMarket

Frontend интернет-магазина команды 67. Доступны каталог товаров из backend API, переключение фотографий, вход и регистрация через backend, загрузка профиля пользователя и выход из аккаунта. Поиск, корзина, рейтинг и отзывы отсутствуют.

## Требования

- Node.js: `^20.19.0`, `^22.13.0` или `>=24` (требование используемой версии ESLint).
- npm и современный браузер с поддержкой ES-модулей и Fetch API.

## Подготовка

Из корня репозитория установите зависимости и подготовьте локальные ресурсы:

```sh
npm ci
```

В PowerShell используйте `npm.cmd ci`, если запуск `npm.ps1` запрещён. `npm ci` устанавливает зависимости и запускает `prepare`, который копирует Handlebars, Inter и лицензии в `public/vendor/`. При отключённых lifecycle-скриптах выполните `npm.cmd run prepare` отдельно.

## Запуск frontend

Стандартный запуск сначала собирает приложение Webpack в `dist/`, затем запускает HTTP-сервер для собранной версии:

```sh
npm start
```

Frontend будет доступен на `http://localhost:8081`. Backend запускается отдельно на `http://localhost:8080`.

`server.js` раздаёт собранные файлы из `dist/` и проксирует запросы `/api/*` на backend `http://localhost:8080`. Frontend использует относительный API-префикс `/api/v1`, поэтому браузер обращается к API на том же origin, что и к frontend, а не напрямую к `localhost:8080`. CORS для такой локальной схемы не требуется.

Через `file://` приложение не запускается, потому что загружает `.hbs` шаблоны по HTTP.

## Разработка

Для автоматической пересборки и раздачи результата запустите две команды в отдельных терминалах:

```sh
npm run watch
npm run preview
```

`watch` следит за исходными файлами и обновляет `dist/`, а `preview` раздаёт содержимое `dist/` на `http://localhost:8081`. Автоматическая перезагрузка браузера не настроена: после пересборки страницу нужно обновить вручную.

Однократную сборку без запуска сервера выполняет `npm run build`.

## Развёртывание

После `npm ci` и `npm run build` разместите **содержимое `dist/`** в корне сайта на HTTP-сервере. Сервер должен отдавать JS с JavaScript MIME-типом, `.hbs` — без подмены на `index.html`, а запросы `/api/*` — проксировать на production-backend. При такой same-origin схеме менять `API_BASE_URL` не нужно, CORS между frontend и backend не требуется. Для reverse proxy можно использовать nginx или другой HTTP-сервер; nginx не является обязательным.

## Запросы к backend

Frontend отправляет `POST /api/v1/auth/login` и `POST /api/v1/auth/register` с JSON-полями `email`, `password`, а также `GET /api/v1/products`. Для входа и регистрации используется `credentials: 'include'`; в ответе ожидаются `accessToken` и `userId`, а cookie `refreshToken` устанавливает backend. Каталог ожидает объект с массивом `products`; каждый товар использует поля `id`, `name`, `pictureUrls`, `priceResult`, `rating` и `reviewsCount`.

Для восстановления сессии frontend отправляет `POST /api/v1/auth/refresh` без тела и с cookie, ожидает `accessToken`. Для профиля запрашивает `GET /api/v1/users/{userId}`, а для выхода — `POST /api/v1/auth/logout`. Эти маршруты описаны в [backend PR #2](https://github.com/go-park-mail-ru/2026_2_67/pull/2). PR #2 и [PR #3](https://github.com/go-park-mail-ru/2026_2_67/pull/3) пока имеют разные маршруты авторизации и должны быть согласованы перед совместным запуском.

Сборка выполняется Webpack с Babel и постепенной поддержкой TypeScript. Подтверждённый публичный адрес пока не указан.

## Документация

- [OpenSpec: спецификации проекта](openspec/README.md).
- [Каталог](openspec/specs/catalog/spec.md), [формы](openspec/specs/auth-forms/spec.md), [оболочка приложения](openspec/specs/app-shell/spec.md).
