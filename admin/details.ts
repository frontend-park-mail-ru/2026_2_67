import type { Entry, Key } from './api';

const labels = {
  name: 'Название', description: 'Описание', scope: 'Scope', value: 'Значение',
  enabled: 'Состояние', percent: 'Раскатка', include: 'Включённые пользователи',
  exclude: 'Исключённые пользователи',
};

function display(value: unknown) {
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'boolean') return value ? 'Включён' : 'Выключен';
  return String(value ?? '') || '—';
}

function date(value?: string) {
  return value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';
}

function summary(ids: string[]) {
  return display(ids.slice(0, 3)) + (ids.length > 3 ? ' (ещё ' + (ids.length - 3) + ')' : '');
}

function evaluate(key: Extract<Key, { type: 'flag' }>, id: string) {
  if (key.exclude.includes(id)) return 'Выключен: пользователь в списке исключений.';
  if (key.include.includes(id)) return 'Включён: пользователь в списке включения.';
  if (!key.enabled) return 'Выключен для всех остальных пользователей.';
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(key.scope + '.' + key.name + ':' + id)) {
    hash = Math.imul(hash ^ byte, 16777619);
  }
  const bucket = (hash >>> 0) % 100;
  return (bucket < key.percent ? 'Включён' : 'Выключен') + ' · группа ' + bucket + ', раскатка ' + key.percent + '%.';
}

export function showDetails(key: Key, entries: Entry[]) {
  const panel = document.querySelector<HTMLElement>('#details')!;
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  function activate(selected: HTMLButtonElement) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')!)!.hidden = !active;
    }
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => activate(tab);
    tab.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index];
      activate(next);
      next.focus();
    };
  });
  activate(tabs[0]);

  const created = entries.find(entry => entry.oldValue === null);
  const facts = panel.querySelector('dl')!;
  facts.replaceChildren();
  function fact(label: string, value: string) {
    const title = document.createElement('dt');
    title.textContent = label;
    const text = document.createElement('dd');
    text.textContent = value;
    facts.append(title, text);
  }
  fact('ID ключа', key.id);
  fact('Создан', date(created?.createdAt));
  fact('Обновлён', date(entries.at(-1)?.createdAt));
  fact('Владелец', created?.changedBy ?? 'Нет данных');
  fact('Описание', display(key.description));
  fact('Тип', key.type === 'config' ? 'Config' : 'Feature Flag');
  fact('Scope', key.scope);
  const form = panel.querySelector('form')!;
  form.reset();
  form.querySelector('output')!.textContent = '';
  form.hidden = key.type !== 'flag';
  if (key.type === 'config') fact('Текущее значение', display(key.value));
  else {
    fact('Состояние', display(key.enabled));
    fact('Раскатка', key.percent + '%');
    fact(labels.include, summary(key.include));
    fact(labels.exclude, summary(key.exclude));
    const user = form.querySelector('input')!;
    const result = form.querySelector('output')!;
    user.oninput = () => { result.textContent = ''; };
    form.onsubmit = event => {
      event.preventDefault();
      result.textContent = evaluate(key, user.value);
    };
  }

  const history = panel.querySelector<HTMLElement>('#history')!;
  history.replaceChildren();
  if (!entries.length) history.textContent = 'История для этого ключа пока недоступна.';
  for (const entry of [...entries].reverse()) {
    const article = document.createElement('article');
    const meta = document.createElement('small');
    meta.textContent = date(entry.createdAt) + ' · ' + entry.changedBy;
    const heading = document.createElement('h3');
    heading.textContent = entry.oldValue ? 'Сохранение ключа' : 'Создание ключа';
    article.append(meta, heading);
    const before: Record<string, unknown> = entry.oldValue ?? {};
    const after: Record<string, unknown> = entry.newValue;
    for (const [field, label] of Object.entries(labels)) {
      if (JSON.stringify(before[field]) === JSON.stringify(after[field])) continue;
      const line = document.createElement('p');
      line.textContent = label + ': ' + display(before[field]) + ' → ' + display(after[field]);
      article.append(line);
    }
    if (article.children.length === 2) article.append('Значения не изменились.');
    history.append(article);
  }
}
