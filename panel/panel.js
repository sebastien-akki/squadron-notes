const me = Math.random().toString(36).slice(2)
const lang = (navigator.language || 'en').toLowerCase()
const fr = lang.startsWith('fr')

const T = fr
  ? {
      loading: 'Chargement…',
      search: 'Chercher dans les notes',
      add: 'Nouvelle note',
      empty: 'Aucune note pour ce projet. Elles restent dans Squadron, sur cet ordinateur : jamais dans le dépôt.',
      noMatch: 'Aucune note ne correspond.',
      untitled: 'Sans titre',
      back: 'Notes',
      placeholder: 'La première ligne sert de titre.',
      insert: 'Mettre dans mon message',
      inserted: 'Ajoutée à votre message.',
      remove: 'Supprimer',
      confirm: 'Confirmer la suppression',
      saving: 'Enregistrement…',
      saved: 'Enregistrée',
      apart: 'La note avait changé ailleurs : l’autre version est gardée dans une note à part.',
      full: 'Non enregistrée : l’espace de 1 Mo que Squadron garde pour Notes est plein. Supprimez de vieilles notes.',
      long: 'Non enregistrée : une note fait 100 000 caractères au plus.',
    }
  : {
      loading: 'Loading…',
      search: 'Search the notes',
      add: 'New note',
      empty: 'No note for this project yet. Notes stay in Squadron, on this computer: never in the repository.',
      noMatch: 'No note matches.',
      untitled: 'Untitled',
      back: 'Notes',
      placeholder: 'The first line is the title.',
      insert: 'Put in my message',
      inserted: 'Added to your message.',
      remove: 'Delete',
      confirm: 'Confirm deletion',
      saving: 'Saving…',
      saved: 'Saved',
      apart: 'The note had changed elsewhere: the other version is kept as a note of its own.',
      full: 'Not saved: the 1 MB Squadron keeps for Notes is full. Delete old notes.',
      long: 'Not saved: a note holds 100,000 characters at most.',
    }

const send = (type, extra = {}) => squadron.send({ ...extra, type, to: me })

const state = { project: null, notes: null, filter: '' }
let ed = null
const pending = {}
let seq = 0
let box = null
let status = null

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean)
const title = (text) => (lines(text)[0] || '').replace(/^#+\s*/, '').slice(0, 80) || T.untitled
const preview = (text) => (lines(text)[1] || '').slice(0, 140)

const relative = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
function when(at) {
  const minutes = Math.round((at - Date.now()) / 60000)
  if (minutes > -1) return relative.format(0, 'minute')
  if (minutes > -60) return relative.format(minutes, 'minute')
  if (minutes > -1440) return relative.format(Math.round(minutes / 60), 'hour')
  if (minutes > -10080) return relative.format(Math.round(minutes / 1440), 'day')
  return new Date(at).toLocaleDateString(lang)
}

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k in el) el[k] = v
    else el.setAttribute(k, v)
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false))
  return el
}

function say(text, error = false, e = ed) {
  if (!e) return
  e.status = text
  e.error = error
  if (e === ed && status) {
    status.textContent = text
    status.className = error ? 'status error' : 'status muted'
  }
}

// A new note waits for its id before a second save, so it is never created twice.
function flush(e = ed) {
  if (!e || e.deleted) return
  clearTimeout(e.timer)
  e.timer = 0
  if (e.text === e.base) return say(e.id ? T.saved : '', false, e)
  if (!e.id && (e.creating || !e.text.trim())) return
  if (!e.id) e.creating = true
  pending[++seq] = e
  e.sent = { seq, text: e.text, base: e.base }
  send('save', { id: e.id, base: e.base, text: e.text, seq })
  e.base = e.text
  say(T.saving, false, e)
}

function typed() {
  ed.text = box.value
  ed.confirm = 0
  say(T.saving)
  clearTimeout(ed.timer)
  ed.timer = setTimeout(() => flush(), 400)
}

function open(note) {
  flush()
  ed = { id: note ? note.id : '', base: note ? note.text : '', text: note ? note.text : '', status: '', error: false, confirm: 0 }
  render()
  box.focus()
}

function back() {
  flush()
  ed = null
  render()
}

function remove() {
  if (!ed.confirm || Date.now() - ed.confirm > 4000) {
    ed.confirm = Date.now()
    return render()
  }
  clearTimeout(ed.timer)
  ed.deleted = true
  if (ed.id) send('delete', { id: ed.id })
  ed = null
  render()
}

function setBox(text) {
  if (!box || box.value === text) return
  const [a, b] = [box.selectionStart, box.selectionEnd]
  box.value = text
  box.setSelectionRange(a, b)
}

function onSaved(msg) {
  state.notes = msg.notes
  const e = pending[msg.seq]
  delete pending[msg.seq]
  if (e && e.deleted && !e.id) send('delete', { id: msg.note.id })
  else if (e) {
    if (!e.id) e.id = msg.note.id
    e.creating = false
    const sent = e.sent && e.sent.seq === msg.seq ? e.sent.text : null
    if (sent !== null && msg.note.text !== sent) {
      const added = msg.note.text.startsWith(sent.trimEnd()) ? msg.note.text.slice(sent.trimEnd().length) : ''
      e.text = e.text === sent ? msg.note.text : e.text + added
      e.base = msg.note.text
      if (e === ed) setBox(e.text)
    }
    if (msg.apart) say(T.apart, false, e)
    if (e.text !== e.base) flush(e)
    else if (!msg.apart) say(T.saved, false, e)
  }
  if (!ed) render()
}

function onList(notes) {
  state.notes = notes
  if (!ed) return render()
  const fresh = notes.find((n) => n.id === ed.id)
  if (fresh && ed.text === ed.base && !ed.timer && fresh.text !== ed.text) {
    ed.text = ed.base = fresh.text
    setBox(fresh.text)
  }
}

function listView() {
  const query = state.filter.toLowerCase()
  const shown = state.notes.filter((n) => !query || n.text.toLowerCase().includes(query))
  const search = h('input', {
    type: 'search',
    placeholder: T.search,
    value: state.filter,
    'aria-label': T.search,
    oninput: (e) => {
      state.filter = e.target.value
      const list = document.getElementById('list')
      list.replaceWith(items(state.notes.filter((n) => !state.filter || n.text.toLowerCase().includes(state.filter.toLowerCase()))))
    },
  })
  return [
    h('header', { className: 'bar' }, search, h('button', { className: 'primary', onclick: () => open(null) }, T.add)),
    state.notes.length ? items(shown) : h('p', { className: 'muted empty' }, T.empty),
  ]
}

function items(shown) {
  if (!shown.length) return h('p', { id: 'list', className: 'muted empty' }, T.noMatch)
  return h(
    'ul',
    { id: 'list', className: 'notes' },
    shown.map((n) =>
      h(
        'li',
        {},
        h(
          'button',
          { className: 'note', onclick: () => open(n) },
          h('span', { className: 'title' }, title(n.text)),
          h('span', { className: 'when muted' }, when(n.at)),
          preview(n.text) && h('span', { className: 'preview muted' }, preview(n.text)),
        ),
      ),
    ),
  )
}

function editorView() {
  box = h('textarea', { value: ed.text, placeholder: T.placeholder, spellcheck: true, oninput: typed, onblur: () => flush(), 'aria-label': title(ed.text) })
  status = h('span', { className: ed.error ? 'status error' : 'status muted', role: 'status' }, ed.status)
  const confirming = ed.confirm && Date.now() - ed.confirm <= 4000
  return [
    h(
      'header',
      { className: 'bar' },
      h('button', { className: 'back', onclick: back }, `← ${T.back}`),
      status,
      h('button', { onclick: () => box.value.trim() && send('insert', { text: box.value }) }, T.insert),
      h('button', { className: confirming ? 'danger' : '', onclick: remove }, confirming ? T.confirm : T.remove),
    ),
    box,
  ]
}

function render() {
  const app = document.getElementById('app')
  box = status = null
  if (state.notes === null) return app.replaceChildren(h('p', { className: 'muted empty' }, T.loading))
  const searching = document.activeElement && document.activeElement.type === 'search'
  app.className = ed ? 'editing' : ''
  app.replaceChildren(...(ed ? editorView() : listView()))
  const search = app.querySelector('input[type=search]')
  if (searching && search) search.focus()
}

squadron.on((msg) => {
  if (!msg || (msg.to !== me && msg.to !== '*')) return
  switch (msg.type) {
    case 'init':
      state.project = msg.project
      state.notes = msg.notes
      return render()
    case 'list':
      return onList(msg.notes)
    case 'changed':
      if (msg.project === state.project) send('list')
      return
    case 'saved':
      return onSaved(msg)
    case 'deleted':
      state.notes = msg.notes
      return ed ? undefined : render()
    case 'inserted':
      return say(T.inserted)
    case 'error': {
      const e = pending[msg.seq]
      delete pending[msg.seq]
      // Not saved: keep the text and send it again on the next change.
      if (e) {
        e.creating = false
        if (e.sent && e.sent.seq === msg.seq) e.base = e.sent.base
      }
      return say(T[msg.message] || msg.message, true, e || ed)
    }
  }
})

addEventListener('pagehide', () => flush())
document.addEventListener('visibilitychange', () => document.hidden && flush())
render()
send('ready')
