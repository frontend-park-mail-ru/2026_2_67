import { api, KeyNameError, nameError, type Key } from './api';
import { startLogin } from './login';
import { showDetails } from './details';

function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

const form = el<HTMLFormElement>('#editor form');
const input = (id: string) => el<HTMLInputElement>(id);
const area = (id: string) => el<HTMLTextAreaElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
let keys: Key[] = [];
let current: Key | undefined;
let actor: string;

function rows() {
  const query = input('#search').value.trim().toLowerCase();
  const type = select('#filter').value;
  const scope = select('#scopes').value;
  const body = el<HTMLTableSectionElement>('tbody');
  body.replaceChildren();
  for (const key of keys) {
    if (!key.name.toLowerCase().includes(query) || (type && type !== key.type) || (scope && scope !== key.scope)) continue;
    const row = body.insertRow();
    const link = document.createElement('a');
    link.href = '#edit/' + encodeURIComponent(key.id);
    link.textContent = key.name;
    row.insertCell().append(link);
    if (key.description) {
      const description = document.createElement('small');
      description.textContent = key.description;
      link.after(description);
    }
    const badge = document.createElement('span');
    badge.className = 'badge ' + key.type;
    badge.textContent = key.type === 'config' ? 'Config' : 'Feature Flag';
    row.insertCell().append(badge);
    row.insertCell().textContent = key.scope;
    const value = row.insertCell();
    if (key.type === 'config') value.textContent = key.value;
    else {
      const status = document.createElement('span');
      status.className = key.enabled ? 'status on' : 'status';
      status.textContent = key.enabled ? 'Включён' : 'Выключен';
      value.append(status, ' · ' + key.percent + '%');
    }
  }
  el('#empty').hidden = body.rows.length > 0;
  el('#count').textContent = 'Показано ключей: ' + body.rows.length + ' из ' + keys.length;
}

function fields() {
  const isFlag = select('#type').value === 'flag';
  el('#config').hidden = isFlag;
  const flag = el<HTMLFieldSetElement>('#flag');
  flag.hidden = !isFlag;
  flag.disabled = !isFlag;
  input('#slider').value = input('#percent').value;
}

function fieldError(id: string, message: string) {
  const field = el('#' + id);
  let note = document.getElementById(id + '-error');
  if (!note) {
    if (!message) return;
    note = document.createElement('small');
    note.id = id + '-error';
    note.className = 'field-error';
    const anchor = id === 'percent' ? el('.rollout') : field;
    anchor.after(note);
    const hint = field.getAttribute('aria-describedby');
    field.setAttribute('aria-describedby', [hint, note.id].filter(Boolean).join(' '));
  }
  note.textContent = message;
  field.setAttribute('aria-invalid', String(Boolean(message)));
}

function clearErrors() {
  for (const field of form.querySelectorAll('[aria-invalid="true"]')) fieldError(field.id, '');
}

async function render() {
  el('#error').textContent = '';
  el('#list').hidden = true;
  el('#editor').hidden = true;
  try {
    keys = await api.list();
    const route = location.hash.slice(1);
    if (!route) {
      const scopes = select('#scopes');
      const previous = scopes.value;
      scopes.replaceChildren(new Option('Все области', ''));
      for (const scope of [...new Set(keys.map(key => key.scope))].sort()) scopes.add(new Option(scope, scope));
      scopes.value = previous;
      if (scopes.selectedIndex < 0) scopes.selectedIndex = 0;
      rows();
      el('#list').hidden = false;
      return;
    }
    current = keys.find(key => route === 'edit/' + encodeURIComponent(key.id));
    if (!current && route !== 'new') {
      el('#error').textContent = 'Ключ не найден.';
      const back = document.createElement('a');
      back.href = '#';
      back.textContent = 'К списку';
      el('#error').append(' ', back);
      return;
    }
    form.reset();
    clearErrors();
    el('#title').textContent = current ? 'Редактирование ключа' : 'Создание ключа';
    input('#name').value = current?.name ?? '';
    area('#description').value = current?.description ?? '';
    input('#scope').value = current?.scope ?? '';
    select('#type').value = current?.type ?? 'config';
    select('#type').disabled = Boolean(current);
    if (current?.type === 'config') area('#value').value = current.value;
    if (current?.type === 'flag') {
      input('#enabled').checked = current.enabled;
      input('#percent').value = String(current.percent);
      area('#include').value = current.include.join(', ');
      area('#exclude').value = current.exclude.join(', ');
    }
    fields();
    el('#editor').classList.toggle('editing', Boolean(current));
    el('#details').hidden = !current;
    if (current) showDetails(current, api.history(current));
    el('#editor').hidden = false;
  } catch {
    el('#error').textContent = 'Не удалось загрузить ключи из локального хранилища.';
  }
}

function ids(selector: string) {
  return [...new Set(area(selector).value.split(/[,\n]/).map(id => id.trim()).filter(Boolean))];
}

form.onsubmit = async event => {
  event.preventDefault();
  const error = el('#error');
  const name = input('#name').value;
  const scope = input('#scope').value.trim();
  clearErrors();
  fieldError('name', nameError(name));
  if (!scope) fieldError('scope', 'Введите scope.');
  if (select('#type').value === 'flag' && !input('#percent').validity.valid) {
    fieldError('percent', 'Введите целое число от 0 до 100.');
  }
  const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (invalid) {
    invalid.focus();
    return;
  }
  const base = { id: current?.id ?? crypto.randomUUID(), name, scope, description: area('#description').value.trim() };
  let key: Key;
  if (select('#type').value === 'flag') {
    const include = ids('#include');
    const exclude = ids('#exclude');
    if (include.some(id => exclude.includes(id))) {
      const message = 'Один пользователь не может быть в обоих списках.';
      fieldError('include', message);
      fieldError('exclude', message);
      area('#include').focus();
      return;
    }
    key = { ...base, type: 'flag', enabled: input('#enabled').checked, percent: input('#percent').valueAsNumber, include, exclude };
  } else {
    key = { ...base, type: 'config', value: area('#value').value };
  }
  try {
    await api.save(key, actor);
    location.hash = '';
  } catch (cause) {
    if (cause instanceof KeyNameError) {
      fieldError('name', cause.message);
      input('#name').focus();
      return;
    }
    error.textContent = cause instanceof Error ? cause.message : 'Не удалось сохранить ключ.';
  }
};

input('#search').oninput = rows;
input('#slider').oninput = () => { input('#percent').value = input('#slider').value; };
input('#percent').oninput = () => { input('#slider').value = input('#percent').value; };
form.addEventListener('input', event => {
  const id = (event.target as HTMLElement).id;
  if (id === 'name') {
    fieldError('name', nameError(input('#name').value));
    return;
  }
  fieldError(id === 'slider' ? 'percent' : id, '');
  if (id === 'include' || id === 'exclude') {
    fieldError('include', '');
    fieldError('exclude', '');
  }
});
select('#filter').onchange = rows;
select('#scopes').onchange = rows;
select('#type').onchange = fields;
void startLogin(userId => {
  actor = 'ID ' + userId;
  el('#login').hidden = true;
  el('.nav-link').hidden = false;
  window.addEventListener('hashchange', render);
  void render();
});
