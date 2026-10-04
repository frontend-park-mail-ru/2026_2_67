# VibeMarket

Frontend интернет-магазина команды 67. Доступны каталог товаров из backend API, переключение фотографий, вход и регистрация через backend, загрузка профиля пользователя и выход из аккаунта. Поиск, корзина, рейтинг и отзывы отсутствуют.

## Требования

- Node.js: `^20.19.0`, `^22.13.0` или `>=24` (требование используемой версии ESLint).
- npm и современный браузер с поддержкой ES-модулей и Fetch API.

## Подготовка и локальный просмотр

Из корня репозитория подготовьте зависимости и ресурсы:

```sh
npm ci
```

В PowerShell используйте `npm.cmd ci`, если запуск `npm.ps1` запрещён. Команда копирует Handlebars, Inter и лицензии в `public/vendor/`. При отключённых lifecycle-скриптах выполните `npm.cmd run prepare` отдельно.

Frontend состоит из статических файлов в `public/`. Для локального просмотра раздайте эту папку любым статическим HTTP-сервером на порту `8081`, например `py -m http.server 8081 --directory public`, и откройте `http://localhost:8081`. Через `file://` приложение не запускается, потому что загружает `.hbs` шаблоны по HTTP. Backend запускается отдельно на `http://localhost:8080`; frontend обращается к нему напрямую по адресу из `public/js/shared/auth.js` (`API_BASE_URL`).

Для работы с разных origin backend должен разрешить `http://localhost:8081` в CORS и обрабатывать запросы `OPTIONS` до проверки авторизации. Для запросов с cookie нужны `Access-Control-Allow-Credentials: true` и конкретный `Access-Control-Allow-Origin: http://localhost:8081` (не `*`). Разрешите методы `GET`, `POST` и заголовки `Content-Type`, `Authorization`; `Content-Type: application/json` и `Authorization` вызывают предварительный запрос `OPTIONS`. Эти заголовки выставляет backend в ответе, а не frontend.


## Развёртывание

После `npm ci` разместите **содержимое `public/`**, включая подготовленный `vendor/`, в корне сайта на статическом HTTP-сервере. Сервер должен отдавать JS с JavaScript MIME-типом, а `.hbs` — без подмены на `index.html`. Перед публикацией замените `API_BASE_URL` в `public/js/shared/auth.js` на публичный адрес backend с префиксом `/api/v1` и разрешите origin опубликованного frontend в CORS backend. `localhost` у посетителя сайта указывает на его собственный компьютер.

## Запросы к backend

Frontend отправляет `POST /api/v1/auth/login` с JSON-полями `loginOrEmail`, `password`, `POST /api/v1/auth/register` с `login`, `email`, `password` и `GET /api/v1/products`. Для входа и регистрации используется `credentials: 'include'`; в ответе ожидаются `accessToken` и `userId`, а cookie `refreshToken` устанавливает backend. Каталог ожидает массив товаров с полями `productName`, `productPictureUrls`, `productPrice`, `productRating`, `productReviewsCount`.

Для восстановления сессии frontend отправляет `POST /api/v1/auth/refresh` без тела и с cookie, ожидает `accessToken`. Для профиля запрашивает `GET /api/v1/users/{userId}`, а для выхода — `POST /api/v1/auth/logout`. Эти маршруты описаны в [backend PR #2](https://github.com/go-park-mail-ru/2026_2_67/pull/2). PR #2 и [PR #3](https://github.com/go-park-mail-ru/2026_2_67/pull/3) пока имеют разные маршруты авторизации и должны быть согласованы перед совместным запуском.

Команды сборки нет. Старый `dist/`, если остался, не используется и не должен публиковаться. Подтверждённый публичный адрес пока не указан.

## Документация

- [OpenSpec: спецификации проекта](openspec/README.md).
- [Каталог](openspec/specs/catalog/spec.md), [формы](openspec/specs/auth-forms/spec.md), [оболочка приложения](openspec/specs/app-shell/spec.md).
