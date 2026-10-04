# Спецификации VibeMarket

## Что где читать

- `specs/catalog/spec.md` — загрузка товаров из API, карточки и фотографии.
- `specs/auth-forms/spec.md` — поля, валидация и отправка форм в API.
- `specs/auth-session/spec.md` — профиль, восстановление сессии и выход.
- `specs/app-shell/spec.md` — запуск, переключение экранов, ресурсы и локальный API-прокси.
- `config.yaml` — схема OpenSpec и общий контекст приложения.

`Requirement` — обязательное поведение, `Scenario` — конкретная ситуация. `WHEN` описывает действие или условие, `THEN` — ожидаемый результат. Английские маркеры сохранены в формате OpenSpec, содержание написано по-русски.

## Устройство проекта

```text
public/index.html                  оболочка, в body только #app
public/css/main.css                оформление экранов
public/images/                     фотографии товаров
public/vendor/                     локальные ресурсы из npm-пакетов
public/js/main.js                  запуск и переключение экранов
public/js/pages/                   каталог, вход, регистрация
public/js/components/product-card/ карточка и фотографии
public/js/data/map-api-product.js  преобразование товаров из API
public/js/shared/auth.js           запросы авторизации и сессия
public/js/shared/forms/            валидация и обработка форм
public/js/templates/               .hbs и загрузчик
scripts/dev-server.js              локальный сервер и API-прокси
scripts/prepare-assets.js          подготовка локальных ресурсов
```

Валидаторы возвращают ошибки по именам полей. Общий обработчик показывает сообщения и после успешной локальной проверки отправляет формы в API. Каталог получает товары из API; для локального запуска нужен доступный backend.
