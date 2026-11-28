import Handlebars from 'handlebars';
import { onlineConfApi, type Config, type Entry, type FeatureFlag, type FlagInput, type HistoryEntry, type Kind, type ValueType } from './api.js';
import { demoApi, draft } from './demo-api.js';
import { startLogin } from './login.js';
import { parseIds, validateConfig, validateFlag, validateValue } from './validate.js';

const app = document.querySelector<HTMLElement>('#onlineconf-app');
if (!app) throw new Error('OnlineConf root not found');
const demo = new URLSearchParams(location.search).has('demo');
const templateNames = ['layout', 'login', 'list', 'editor'] as const;
type TemplateName = typeof templateNames[number];
const templates = {} as Record<TemplateName, Handlebars.TemplateDelegate>;
let authorized = demo;
let entries: Entry[] = [];
let selected: Entry | null = null;
let q = '';
let scope = '';
let kindFilter = '';
let saving = false;
let version = 0;

function screen(): HTMLElement {
  const element = app!.querySelector<HTMLElement>('#onlineconf-screen');
  if (!element) throw new Error('Не найден экран OnlineConf.');
  return element;
}
function value(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value.trim();
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : 'Не удалось выполнить запрос.'; }
function showError(message: string): void {
  const element = screen().querySelector<HTMLElement>('[data-error]');
  if (element) element.textContent = message;
}
function currentRoute(): { kind: Kind | null; id: number; create: boolean } {
  const path = location.pathname.replace(/\/$/, '');
  const match = /^\/onlineconf\/(configs|flags)\/(\d+)$/.exec(path);
  if (match) return { kind: match[1] as Kind, id: Number(match[2]), create: false };
  return { kind: null, id: 0, create: path === '/onlineconf/new' };
}
function suffix(): string { return demo ? '?demo' : ''; }
function navigate(path: string): void {
  history.pushState({}, '', path);
  void render();
}
function showLogin(message = ''): void {
  authorized = false;
  app!.innerHTML = templates.layout({ authorized: false });
  screen().innerHTML = templates.login({ message });
  void startLogin(screen(), () => { authorized = true; void render(); }).catch((error: unknown) => {
    const target = screen().querySelector<HTMLElement>('[data-access-error]');
    if (target) target.textContent = errorText(error);
  });
}
async function loadEntries(): Promise<Entry[]> {
  const [configs, flags] = await Promise.all([
    demo ? demoApi.list('configs') : onlineConfApi.list('configs'),
    demo ? demoApi.list('flags') : onlineConfApi.list('flags'),
  ]);
  return [...configs, ...flags];
}
function display(entry: Entry): string {
  return 'valueType' in entry ? JSON.stringify(entry.value) : `${entry.enabled ? 'Включён' : 'Выключен'} · ${entry.rolloutPercent}%`;
}
function historyView(item: HistoryEntry): object {
  const before = item.oldValue && typeof item.oldValue === 'object' ? item.oldValue as Record<string, unknown> : {};
  const after = item.newValue && typeof item.newValue === 'object' ? item.newValue as Record<string, unknown> : {};
  const labels: Record<string, string> = { key: 'Ключ', scope: 'Scope', description: 'Описание', valueType: 'Тип значения',
    value: 'Значение', enabled: 'Состояние', rolloutPercent: 'Раскатка', whitelist: 'Whitelist', blacklist: 'Blacklist' };
  return { ...item, changes: Object.entries(labels).filter(([field]) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map(([field, label]) => ({ label, before: JSON.stringify(before[field]) ?? '—', after: JSON.stringify(after[field]) ?? '—' })) };
}
function applyFilters(): void {
  let count = 0;
  screen().querySelectorAll<HTMLTableRowElement>('tr[data-key]').forEach((row) => {
    row.hidden = !row.dataset.key?.toLowerCase().includes(q.toLowerCase())
      || Boolean(scope && row.dataset.scope !== scope)
      || Boolean(kindFilter && row.dataset.kind !== (kindFilter === 'configs' ? 'config' : 'flag'));
    if (!row.hidden) count += 1;
  });
  const empty = screen().querySelector<HTMLElement>('#empty');
  if (empty) empty.hidden = count > 0;
  const total = screen().querySelector<HTMLElement>('.count');
  if (total) total.textContent = `Показано ключей: ${count} из ${entries.length}`;
}
async function render(): Promise<void> {
  const current = ++version;
  if (!authorized) { showLogin(); return; }
  app!.innerHTML = templates.layout({ authorized: true });
  screen().innerHTML = '<p role="status">Загрузка…</p>';
  try {
    entries = await loadEntries();
    if (current !== version) return;
    const route = currentRoute();
    selected = entries.find((entry) => entry.id === route.id && (route.kind === 'configs' ? 'valueType' in entry : 'enabled' in entry)) ?? null;
    if (route.id && !selected) { screen().innerHTML = '<p role="alert">Ключ не найден.</p><a href="/onlineconf/" data-route>К списку</a>'; return; }
    if (route.id || route.create) {
      const kind = route.kind ?? 'configs';
      const entry = selected ?? draft(kind);
      const isConfig = 'valueType' in entry;
      let historyEntries: HistoryEntry[] = [];
      if (selected) {
        try { historyEntries = demo ? await demoApi.history(isConfig ? 'config' : 'flag', entry.id)
          : await onlineConfApi.history(isConfig ? 'config' : 'flag', entry.id); }
        catch { /* The editor remains usable when history is unavailable. */ }
      }
      if (current !== version) return;
      screen().innerHTML = templates.editor({
        demo, suffix: suffix(), entry, editing: Boolean(selected), isConfig,
        kindLabel: isConfig ? 'Config' : 'Feature Flag',
        types: (['string', 'number', 'boolean', 'array', 'json'] as ValueType[]).map((name) => ({ name, selected: isConfig && entry.valueType === name })),
        valueText: isConfig ? JSON.stringify(entry.value, null, 2) : '',
        whitelist: isConfig ? '' : entry.whitelist.join(', '),
        blacklist: isConfig ? '' : entry.blacklist.join(', '),
        history: historyEntries.map(historyView),
      });
      return;
    }
    screen().innerHTML = templates.list({
      demo, suffix: suffix(), q, configsSelected: kindFilter === 'configs', flagsSelected: kindFilter === 'flags',
      scopes: [...new Set(entries.map((entry) => entry.scope))].sort().map((name) => ({ name, selected: name === scope })),
      rows: entries.map((entry) => ({ ...entry, kind: 'valueType' in entry ? 'config' : 'flag',
        label: 'valueType' in entry ? 'Config' : 'Feature Flag', display: display(entry),
        url: `/onlineconf/${'valueType' in entry ? 'configs' : 'flags'}/${entry.id}${suffix()}` })),
    });
    applyFilters();
  } catch (error) {
    if (current !== version) return;
    screen().innerHTML = `<p role="alert" data-error></p><button type="button" data-retry>Повторить</button>`;
    showError(errorText(error));
  }
}

app.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('[data-route]');
  if (link) { event.preventDefault(); navigate(link.pathname + link.search); return; }
  if (event.target.closest('[data-retry]')) { void render(); return; }
  if (event.target.closest('[data-delete]') && selected && !saving && confirm('Удалить ключ?')) {
    saving = true;
    const kind: Kind = 'valueType' in selected ? 'configs' : 'flags';
    void (demo ? demoApi.remove(kind, selected.id) : onlineConfApi.remove(kind, selected.id))
      .then(() => navigate(`/onlineconf/${suffix()}`))
      .catch((error: unknown) => showError(errorText(error)))
      .finally(() => { saving = false; });
    return;
  }
  const tab = event.target.closest<HTMLButtonElement>('[role="tab"]');
  if (tab) {
    const panel = screen().querySelector<HTMLElement>(`#${tab.getAttribute('aria-controls')}`);
    if (!panel) return;
    screen().querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((item) => {
      item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1;
    });
    screen().querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach((item) => { item.hidden = item !== panel; });
  }
});
app.addEventListener('keydown', (event) => {
  if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute('role') !== 'tab'
    || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...screen().querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const index = tabs.indexOf(event.target);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next]?.click(); tabs[next]?.focus();
});
app.addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const filter = event.target.closest<HTMLFormElement>('[data-filter]');
  if (filter) { q = value(filter, 'q'); applyFilters(); return; }
  const form = event.target.closest<HTMLFormElement>('[data-editor]');
  if (!form) return;
  if (event.target.id === 'slider') (form.elements.namedItem('rolloutPercent') as HTMLInputElement).value = event.target.value;
  if (event.target.id === 'percent') (form.querySelector<HTMLInputElement>('#slider')!).value = event.target.value;
});
app.addEventListener('change', (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.closest('[data-filter]')) {
    const filter = event.target.closest<HTMLFormElement>('[data-filter]')!;
    kindFilter = value(filter, 'kind'); scope = value(filter, 'scope'); applyFilters(); return;
  }
  if (!(event.target instanceof HTMLSelectElement) || event.target.name !== 'kind') return;
  const form = event.target.closest<HTMLFormElement>('[data-editor]');
  if (!form) return;
  const flag = event.target.value === 'flags';
  const config = form.querySelector<HTMLElement>('#config');
  const fieldset = form.querySelector<HTMLFieldSetElement>('#flag');
  if (config) { config.hidden = flag; config.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea').forEach((field) => { field.disabled = flag; }); }
  if (fieldset) { fieldset.hidden = !flag; fieldset.disabled = !flag; }
});
app.addEventListener('submit', async (event) => {
  if (!(event.target instanceof HTMLFormElement)) return;
  const form = event.target;
  if (!form.matches('[data-filter], [data-editor], [data-evaluate]')) return;
  event.preventDefault();
  if (form.matches('[data-filter]')) {
    q = value(form, 'q'); scope = value(form, 'scope'); kindFilter = value(form, 'kind'); void render(); return;
  }
  if (form.matches('[data-evaluate]')) {
    if (!selected || 'valueType' in selected) return;
    const userId = Number(value(form, 'userId'));
    const output = form.querySelector<HTMLOutputElement>('output');
    if (!output) return;
    if (!Number.isSafeInteger(userId) || userId <= 0) { output.textContent = 'Укажите положительный ID пользователя.'; return; }
    try {
      const result = demo ? await demoApi.evaluate(selected, userId) : await onlineConfApi.evaluate(selected.id, userId);
      output.textContent = `${result.enabled ? 'Включён' : 'Выключен'} · ${result.reason} · группа ${result.bucket}`;
    } catch (error) { output.textContent = errorText(error); }
    return;
  }
  if (saving) return;
  saving = true;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const key = value(form, 'key');
    const entryScope = value(form, 'scope');
    const description = value(form, 'description');
    const kind = selected ? ('valueType' in selected ? 'configs' : 'flags') : value(form, 'kind') as Kind;
    if (kind === 'configs') {
      const valueType = value(form, 'valueType') as ValueType;
      const input = validateConfig({ key, scope: entryScope, description, valueType, value: validateValue(valueType, value(form, 'value')) });
      if (demo) await demoApi.save(kind, { ...draft(kind), ...input, id: selected?.id ?? 0 } as Config);
      else if (selected) await onlineConfApi.update(selected.id, { valueType, value: input.value, description });
      else await onlineConfApi.create(input);
    } else {
      const input: FlagInput = validateFlag({ key, scope: entryScope, description,
        enabled: (form.elements.namedItem('enabled') as HTMLInputElement).checked,
        rolloutPercent: Number(value(form, 'rolloutPercent')),
        whitelist: parseIds(value(form, 'whitelist')), blacklist: parseIds(value(form, 'blacklist')) });
      if (demo) await demoApi.save(kind, { ...draft(kind), ...input, id: selected?.id ?? 0 } as FeatureFlag);
      else if (selected) await onlineConfApi.updateFlag(selected.id, input);
      else await onlineConfApi.createFlag(input);
    }
    navigate(`/onlineconf/${suffix()}`);
  } catch (error) {
    showError(errorText(error));
    if (submit) submit.disabled = false;
  } finally { saving = false; }
});
window.addEventListener('popstate', () => { void render(); });

void Promise.all(templateNames.map(async (name) => {
  const response = await fetch(`/onlineconf/templates/${name}.hbs`);
  if (!response.ok) throw new Error(`Не удалось загрузить шаблон ${name}.`);
  templates[name] = Handlebars.compile(await response.text());
})).then(() => { if (demo) void render(); else showLogin(); })
  .catch((error: unknown) => { app!.textContent = errorText(error); });
