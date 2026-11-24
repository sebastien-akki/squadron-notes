// Just enough Markdown to read a note and tick its checklists; the page only ever adds it as text.
const Md = (() => {
  const TASK = /^(\s*)[-*+] \[([ xX])\] (.*)$/
  const ITEM = /^(\s*)([-*+]|\d+[.)]) (.*)$/
  const HEAD = /^(#{1,6})\s+(.*)$/
  const FENCE = /^\s*```/

  function parse(text) {
    const lines = text.split('\n')
    const out = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      let m
      if (FENCE.test(l)) {
        const body = []
        while (++i < lines.length && !FENCE.test(lines[i])) body.push(lines[i])
        out.push({ kind: 'code', text: body.join('\n') })
      } else if ((m = TASK.exec(l))) out.push({ kind: 'task', done: m[2] !== ' ', text: m[3], depth: m[1].length, line: i })
      else if ((m = ITEM.exec(l))) out.push({ kind: 'item', mark: /\d/.test(m[2]) ? m[2] : '•', text: m[3], depth: m[1].length })
      else if ((m = HEAD.exec(l))) out.push({ kind: 'head', level: m[1].length, text: m[2] })
      else if (l.trim()) out.push({ kind: 'text', text: l })
      else out.push({ kind: 'blank' })
    }
    return out
  }

  function toggle(text, line) {
    if (!parse(text).some((b) => b.kind === 'task' && b.line === line)) return text
    const lines = text.split('\n')
    const m = TASK.exec(lines[line])
    lines[line] = lines[line].replace(/\[[ xX]\]/, m[2] === ' ' ? '[x]' : '[ ]')
    return lines.join('\n')
  }

  function inline(text) {
    return text
      .split(/(`[^`]+`|\*\*[^*]+\*\*)/)
      .filter(Boolean)
      .map((s) =>
        s.length > 2 && s.startsWith('`') && s.endsWith('`') ? { kind: 'code', text: s.slice(1, -1) }
          : s.length > 4 && s.startsWith('**') && s.endsWith('**') ? { kind: 'bold', text: s.slice(2, -2) }
            : { kind: 'text', text: s },
      )
  }

  return { parse, toggle, inline }
})()

if (typeof module !== 'undefined') module.exports = Md
