# Notes

Private notes for each Squadron project, next to your agents.

## Use

- Click **Notes** in an agent's toolbar. The panel lists the notes of the agent's project, newest first, with a search box.
- **New note** opens an empty note. The first line is its title. Every change is saved as you type.
- **Read** shows the note with its Markdown: headings, lists, bold, code, and `- [ ]` checklists ticked with one click; **Edit** goes back to the text. **Pin** keeps a note at the top of the list. **Escape** goes back to the list.
- **Put in my message** adds the selected text, or the whole note without a selection, to the message you are writing to the agent.
- **Delete** asks for a second click.
- Agents can call `notes_list`, `notes_read` and `notes_append`. Claude Code asks you before each call. When an agent adds to a note you are writing, both texts are kept.

Notes stay in Squadron, on this computer. They are never written to the project's repository.

## What it asks Squadron for

Nothing: no program, no network, no access to your agents or projects. The notes live in the extension's storage, keyed by the project's opaque id, so renaming or moving the project keeps them. Squadron keeps 1 MB for the extension; a note holds 100,000 characters at most, and the panel says so when the storage is full.

## Build

```sh
rustup target add wasm32-wasip2
cargo test
cargo build --release --target wasm32-wasip2
```

Then in Squadron: Settings › Extensions › Add an extension › A folder on this computer, and choose this folder. Each build reloads it.
