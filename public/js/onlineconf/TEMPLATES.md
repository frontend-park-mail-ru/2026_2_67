# Контракт шаблонов OnlineConf

Временная разметка находится в `main.ts` в одном `Handlebars.compile`. Дизайнер может перенести её в `.hbs`, сохранив атрибуты ниже. Обработчики привязаны к `data-*`, не к CSS-классам.

| Часть | Данные | Действия / атрибуты | Состояния |
|---|---|---|---|
| Оболочка | `demo`, `suffix` | ссылки `/onlineconf/configs` и `/onlineconf/flags` с `data-route` | демо, ошибка доступа |
| Список | `entries: Config[] \| FeatureFlag[]`, `title`, `q`, `scope` | `data-filter`, поля `q`, `scope`; у записи `data-edit-id="{{id}}"` | загрузка, пустой список, ошибка API |
| Редактор Config | `entry: Config`, `editing`, `types`, `valueText` | `data-editor`; поля `key`, `scope`, `description`, `valueType`, `value`; `data-delete`, `data-error` | создание, редактирование, ошибка, сохранение |
| Редактор FeatureFlag | `entry: FeatureFlag`, `editing`, `whitelist`, `blacklist` | `data-editor`; поля `key`, `scope`, `description`, `enabled`, `rolloutPercent`, `whitelist`, `blacklist`; `data-delete`, `data-error` | создание, редактирование, ошибка, сохранение |

При редактировании `key` и `scope` доступны только для чтения: `PUT` не позволяет их менять. `value` в конфиге вводится как JSON и проверяется по `valueType`. Списки ID вводятся через запятую. Handlebars должен экранировать переменные обычными `{{…}}`; не использовать тройные скобки для значения или описания.

Сетевые модели и методы находятся в `api.ts`; демо-данные — отдельно в `demo-api.ts`. Админские данные и редактор показываются только после успешного `/admin/me`, кроме явного `?demo`.
