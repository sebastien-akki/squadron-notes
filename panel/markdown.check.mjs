import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const Md = createRequire(import.meta.url)('./markdown.js')
const note = '# Livraison\n\n- [ ] staging\n  - [x] tests\n- liste\n1. un\n```\n- [ ] pas une case\n```\nfin **gras** et `code`'
const kinds = Md.parse(note).map((b) => b.kind)
assert.deepEqual(kinds, ['head', 'blank', 'task', 'task', 'item', 'item', 'code', 'text'])
assert.deepEqual(Md.parse(note)[3], { kind: 'task', done: true, text: 'tests', depth: 2, line: 3 })
assert.equal(Md.toggle(note, 2).split('\n')[2], '- [x] staging')
assert.equal(Md.toggle(Md.toggle(note, 2), 2), note)
assert.equal(Md.toggle(note, 7), note)
assert.equal(Md.toggle(note, 0), note)
assert.deepEqual(Md.inline('fin **gras** et `code`').map((p) => p.kind), ['text', 'bold', 'text', 'code'])
assert.deepEqual(Md.inline('a ** b'), [{ kind: 'text', text: 'a ** b' }])
console.log('markdown: ok')
