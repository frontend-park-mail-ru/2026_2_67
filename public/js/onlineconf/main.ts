import Handlebars from 'handlebars';
import { restoreSession } from '../shared/auth.js';
import { ApiError, onlineConfApi, type Config, type Entry, type FeatureFlag, type FlagInput, type Kind, type ValueType } from './api.js';
import { demoApi, draft } from './demo-api.js';
import { parseIds, validateConfig, validateFlag, validateValue } from './validate.js';

const app = document.querySelector<HTMLElement>('#onlineconf-app');
if (!app) throw new Error('OnlineConf root not found');
const demo = new URLSearchParams(location.search).has('demo');
const template = Handlebars.compile(`
  <header><h1>OnlineConf</h1><nav aria-label="Разделы">
    <a href="/onlineconf/configs{{suffix}}" data-route>Конфигурации</a>
    <a href="/onlineconf/flags{{suffix}}" data-route>Флаги</a>
  </nav></header>
  <main>
    {{#if demo}}<p role="status">Демо: изменения хранятся только в памяти вкладки.</p>{{/if}}
    {{#if accessError}}<p role="alert">{{accessError}}</p>{{#if loginRequired}}<a href="/login">Войти в магазин</a>{{/if}}{{else}}
      <h2>{{title}}</h2>
      <form data-filter>
        <label>Поиск <input name="q" type="search" value="{{q}}"></label>
        <label>Скоуп <input name="scope" value="{{scope}}"></label>
        <button type="submit">Найти</button>
      </form>
      <ul>{{#each entries}}<li><button type="button" data-edit-id="{{id}}">{{key}}</button> — {{scope}} — {{description}}</li>{{else}}<li>Ничего не найдено</li>{{/each}}</ul>
      <h3>{{#if editing}}Редактирование{{else}}Новый ключ{{/if}}</h3>
      <form data-editor>
        <label>Ключ <input name="key" required value="{{entry.key}}" {{#if editing}}readonly{{/if}}></label>
        <label>Скоуп <input name="scope" required value="{{entry.scope}}" {{#if editing}}readonly{{/if}}></label>
        <label>Описание <input name="description" value="{{entry.description}}"></label>
        {{#if isConfig}}
          <label>Тип <select name="valueType">
            {{#each types}}<option value="{{name}}" {{#if selected}}selected{{/if}}>{{name}}</option>{{/each}}
          </select></label>
          <label>JSON-значение <textarea name="value" required>{{valueText}}</textarea></label>
        {{else}}
          <label>Включён <input name="enabled" type="checkbox" {{#if entry.enabled}}checked{{/if}}></label>
          <label>Раскатка, % <input name="rolloutPercent" type="number" min="0" max="100" required value="{{entry.rolloutPercent}}"></label>
          <label>Whitelist, ID через запятую <input name="whitelist" value="{{whitelist}}"></label>
          <label>Blacklist, ID через запятую <input name="blacklist" value="{{blacklist}}"></label>
        {{/if}}
        <button type="submit">Сохранить</button>
        {{#if editing}}<button type="button" data-delete>Удалить</button>{{/if}}
        <p role="alert" data-error></p>
      </form>
    {{/if}}
  </main>`);

let kind: Kind = 'configs';
let q = '';
let scope = '';
let selectedId = 0;
let saving = false;
let renderVersion = 0;
let accessError = '';
let loginRequired = false;

function readKind(): Kind { return location.pathname === '/onlineconf/flags' ? 'flags' : 'configs'; }
function formValue(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value.trim();
}
function showError(message: string): void {
  const error = app!.querySelector<HTMLElement>('[data-error]');
  if (error) error.textContent = message;
}
async function list(): Promise<Entry[]> {
  return demo ? demoApi.list(kind, q, scope) : onlineConfApi.list(kind, q, scope);
}
async function render(): Promise<void> {
  const version = ++renderVersion;
  kind = readKind();
  app!.innerHTML = '<p role="status">Загрузка…</p>';
  try {
    if (accessError) { app!.innerHTML = template({ accessError, loginRequired, demo, suffix: demo ? '?demo' : '' }); return; }
    const entries = await list();
    if (version !== renderVersion) return;
    const editing = entries.find((entry) => entry.id === selectedId);
    const entry = editing ?? draft(kind);
    const isConfig = kind === 'configs';
    app!.innerHTML = template({
      demo, suffix: demo ? '?demo' : '', entries, entry, editing: Boolean(editing), isConfig,
      title: isConfig ? 'Конфигурации' : 'Флаги', q, scope,
      types: (['string', 'number', 'boolean', 'array', 'json'] as ValueType[]).map((name) => ({ name, selected: isConfig && name === (entry as Config).valueType })),
      valueText: isConfig ? JSON.stringify((entry as Config).value, null, 2) : '',
      whitelist: !isConfig ? (entry as FeatureFlag).whitelist.join(', ') : '',
      blacklist: !isConfig ? (entry as FeatureFlag).blacklist.join(', ') : '',
    });
  } catch (error) {
    if (version !== renderVersion) return;
    app!.innerHTML = template({ accessError: error instanceof Error ? error.message : 'Не удалось загрузить данные.', demo, suffix: demo ? '?demo' : '' });
  }
}

app.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('[data-route]');
  if (link) { event.preventDefault(); history.pushState({}, '', link.pathname + link.search); selectedId = 0; void render(); return; }
  const edit = event.target.closest<HTMLElement>('[data-edit-id]');
  if (edit) { selectedId = Number(edit.dataset.editId); void render(); return; }
  if (event.target.closest('[data-delete]') && selectedId && !saving && confirm('Удалить запись?')) {
    saving = true;
    void (demo ? demoApi.remove(kind, selectedId) : onlineConfApi.remove(kind, selectedId))
      .then(() => { selectedId = 0; return render(); })
      .catch((error: unknown) => showError(error instanceof Error ? error.message : 'Не удалось удалить.'))
      .finally(() => { saving = false; });
  }
});
app.addEventListener('submit', async (event) => {
  if (!(event.target instanceof HTMLFormElement)) return;
  event.preventDefault();
  const form = event.target;
  if (form.matches('[data-filter]')) { q = formValue(form, 'q'); scope = formValue(form, 'scope'); selectedId = 0; void render(); return; }
  if (!form.matches('[data-editor]') || saving) return;
  const key = formValue(form, 'key');
  const entryScope = formValue(form, 'scope');
  const description = formValue(form, 'description');
  try {
    saving = true;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    if (kind === 'configs') {
      const valueType = formValue(form, 'valueType') as ValueType;
      const input = validateConfig({ key, scope: entryScope, description, valueType, value: validateValue(valueType, formValue(form, 'value')) });
      if (demo) await demoApi.save(kind, { ...draft(kind), ...input, id: selectedId } as Config);
      else if (selectedId) await onlineConfApi.update(selectedId, { valueType, value: input.value, description });
      else await onlineConfApi.create(input);
    } else {
      const input: FlagInput = validateFlag({
        key, scope: entryScope, description,
        enabled: (form.elements.namedItem('enabled') as HTMLInputElement).checked,
        rolloutPercent: Number(formValue(form, 'rolloutPercent')),
        whitelist: parseIds(formValue(form, 'whitelist')),
        blacklist: parseIds(formValue(form, 'blacklist')),
      });
      if (demo) await demoApi.save(kind, { ...draft(kind), ...input, id: selectedId } as FeatureFlag);
      else if (selectedId) await onlineConfApi.updateFlag(selectedId, input);
      else await onlineConfApi.createFlag(input);
    }
    selectedId = 0;
    await render();
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Не удалось сохранить.');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = false;
  } finally { saving = false; }
});
window.addEventListener('popstate', () => { selectedId = 0; void render(); });

if (demo) void render();
else void restoreSession().then(() => onlineConfApi.me())
  .then(() => render())
  .catch((error: unknown) => {
    accessError = error instanceof ApiError && error.status === 403 ? 'Нет прав администратора OnlineConf.'
      : error instanceof ApiError && error.status === 401 ? 'Войдите в аккаунт.'
        : error instanceof Error ? error.message : 'Не удалось проверить права.';
    loginRequired = error instanceof ApiError && error.status === 401;
    void render();
  });
