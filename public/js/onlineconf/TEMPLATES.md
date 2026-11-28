# Шаблоны OnlineConf

Шаблоны лежат в `public/js/onlineconf/templates/` и загружаются в `main.ts`. Стиль перенесён из ветки `feat/onlineconf-admin` без смены палитры и сетки. HTML-документ находится в `public/onlineconf/index.html`.

| Шаблон | Входные данные | Действия и обязательные привязки | Состояния |
|---|---|---|---|
| `layout.hbs` | `authorized` | ссылки с `data-route`; контейнер `#onlineconf-screen` | вход, приложение |
| `login.hbs` | `message` | контейнер `#login-fields`, сообщение `data-access-error`; форма VibeMarket вставляется из существующего `login.hbs` | 401, 403, ошибка сети |
| `list.hbs` | `rows[]` с `key`, `description`, `scope`, `kind`, `display`, `url`; `scopes[]`, `q`, `demo`, `suffix` | `data-filter` с `q`, `kind`, `scope`; ссылки `data-route`; `tr[data-key][data-kind][data-scope]`; `#empty`, `.count` | загрузка, список, пусто, ошибка |
| `editor.hbs` | `entry: Config \| FeatureFlag`, `editing`, `isConfig`, `types[]`, `valueText`, `whitelist`, `blacklist`, `history[]` | `data-editor`; поля `key`, `scope`, `description`, `kind`, `valueType`, `value`, `enabled`, `rolloutPercent`, `whitelist`, `blacklist`; `data-delete`, `data-error`; `data-evaluate` с `userId`; табы с `aria-controls` | создание, редактирование, сохранение, ошибка, история, оценка флага |

`key` и `scope` у сохранённой записи доступны только для чтения: документированный `PUT` их не меняет. `value` вводится как JSON и проверяется по `valueType`. Списки ID принимают запятые и новые строки. Используйте обычные `{{…}}`, чтобы Handlebars экранировал значения и описания.

`api.ts` содержит единственный сетевой клиент. `demo-api.ts` применяется только при `?demo`, не сохраняет данные магазина и не заменяет серверную проверку прав, историю или оценку флага в обычном режиме.
