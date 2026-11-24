mod note;

use note::Note;
use serde_json::{Value, json};
use squadron_extension_api::{Agent, Extension, host, squadron_extension};
use std::time::{SystemTime, UNIX_EPOCH};

struct Notes;

const FULL: &str = "full";
const LONG: &str = "long";
const MISSING: &str = "missing";

fn english(error: String) -> String {
    match error.as_str() {
        FULL => "The note could not be saved: the 1 MB Squadron keeps for Notes is full. Ask the user to delete old notes.".into(),
        LONG => format!("A note holds {} characters at most.", note::MAX_LEN),
        MISSING => "No note of this project has this id: call notes_list.".into(),
        _ => error,
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

// `project` is the opaque id Squadron gives an extension without `exec` nor `agents`: stable, never the folder.
fn key(project: &str) -> String {
    format!("notes:{project}")
}

fn load(project: &str) -> Vec<Note> {
    let saved = host::state_get(&key(project)).and_then(|s| serde_json::from_str(&s).ok());
    note::sorted(saved.unwrap_or_default())
}

fn store(project: &str, notes: &[Note]) -> Result<(), String> {
    let saved = serde_json::to_string(notes).map_err(|e| e.to_string())?;
    let value = (!notes.is_empty()).then_some(saved.as_str());
    host::state_set(&key(project), value);
    // Read back, so that a write Squadron refused never passes for saved.
    if host::state_get(&key(project)).as_deref() != value {
        return Err(FULL.into());
    }
    Ok(())
}

fn short_enough(text: &str) -> Result<(), String> {
    if text.len() > note::MAX_LEN { Err(LONG.into()) } else { Ok(()) }
}

fn save(project: &str, id: &str, base: &str, text: &str) -> Result<(Note, bool), String> {
    short_enough(text)?;
    let mut notes = load(project);
    let at = now();
    let (saved, apart) = match notes.iter().position(|n| n.id == id) {
        Some(i) => {
            let (merged, apart) = note::merge(&notes[i].text, base, text);
            notes[i].text = merged;
            notes[i].at = at;
            let saved = notes[i].clone();
            if let Some(other) = &apart {
                let id = note::new_id(&notes, at);
                notes.push(Note { id, text: other.clone(), at: at.saturating_sub(1), pinned: false });
            }
            (saved, apart.is_some())
        }
        None => {
            let created = Note { id: note::new_id(&notes, at), text: text.to_string(), at, pinned: false };
            notes.push(created.clone());
            (created, false)
        }
    };
    store(project, &notes)?;
    Ok((saved, apart))
}

fn remove(project: &str, id: &str) -> Result<(), String> {
    let mut notes = load(project);
    notes.retain(|n| n.id != id);
    store(project, &notes)
}

fn pin(project: &str, id: &str, pinned: bool) -> Result<(), String> {
    let mut notes = load(project);
    notes.iter_mut().find(|n| n.id == id).ok_or(MISSING)?.pinned = pinned;
    store(project, &notes)
}

fn append(project: &str, id: Option<&str>, text: &str) -> Result<Note, String> {
    let mut notes = load(project);
    let at = now();
    let i = match id {
        Some(id) => notes.iter().position(|n| n.id == id).ok_or(MISSING)?,
        None => {
            notes.push(Note { id: note::new_id(&notes, at), text: String::new(), at, pinned: false });
            notes.len() - 1
        }
    };
    notes[i].text = note::appended(&notes[i].text, text);
    notes[i].at = at;
    short_enough(&notes[i].text)?;
    store(project, &notes)?;
    Ok(notes[i].clone())
}

fn post(message: Value) {
    host::panel_post("main", &message.to_string());
}

fn answer(kind: &str, agent: &Agent, message: &Value) -> Result<Value, String> {
    let project = agent.project.as_str();
    let text = |k: &str| message[k].as_str().unwrap_or_default().to_string();
    Ok(match kind {
        "ready" => json!({ "type": "init", "project": project, "notes": load(project) }),
        "list" => json!({ "type": "list", "notes": load(project) }),
        "save" => {
            let (saved, apart) = save(project, &text("id"), &text("base"), &text("text"))?;
            json!({ "type": "saved", "seq": message["seq"], "note": saved, "apart": apart, "notes": load(project) })
        }
        "delete" => {
            remove(project, &text("id"))?;
            json!({ "type": "deleted", "id": text("id"), "notes": load(project) })
        }
        "pin" => {
            pin(project, &text("id"), message["pinned"].as_bool().unwrap_or(false))?;
            json!({ "type": "pinned", "notes": load(project) })
        }
        "insert" => {
            host::insert_prompt(&agent.id, &text("text"));
            json!({ "type": "inserted" })
        }
        _ => return Err(format!("Unknown request {kind}.")),
    })
}

impl Extension for Notes {
    fn on_event(name: String, agent: Option<Agent>, data: String) {
        if name != "panel.message" {
            return;
        }
        let data: Value = serde_json::from_str(&data).unwrap_or_default();
        let message = &data["message"];
        let to = message["to"].as_str().unwrap_or_default();
        let kind = message["type"].as_str().unwrap_or_default();
        let Some(agent) = agent else { return };
        let mut reply = answer(kind, &agent, message)
            .unwrap_or_else(|error| json!({ "type": "error", "for": kind, "seq": message["seq"], "message": error }));
        reply["to"] = json!(to);
        post(reply);
    }

    fn call_tool(name: String, input: String, agent: Option<Agent>) -> Result<String, String> {
        let project = agent
            .map(|a| a.project)
            .filter(|p| !p.is_empty())
            .ok_or("Notes belong to a Squadron project: call this tool from an agent of a project.")?;
        let input: Value = serde_json::from_str(&input).unwrap_or_default();
        let id = input["id"].as_str().map(str::trim).filter(|s| !s.is_empty());
        let notes = load(&project);
        match name.as_str() {
            "list" if notes.is_empty() => Ok("The user has no note for this project yet.".into()),
            "list" => Ok(notes.iter().map(|n| format!("{} — {}{}", n.id, note::title(&n.text), if n.pinned { " (pinned)" } else { "" })).collect::<Vec<_>>().join("\n")),
            "read" => match id {
                Some(id) => notes.into_iter().find(|n| n.id == id).map(|n| n.text).ok_or_else(|| english(MISSING.into())),
                None if notes.is_empty() => Ok("The user has no note for this project yet.".into()),
                None => Ok(notes.iter().map(|n| format!("## Note {}\n\n{}", n.id, n.text)).collect::<Vec<_>>().join("\n\n---\n\n")),
            },
            "append" => {
                let text = input["text"].as_str().unwrap_or_default().trim();
                if text.is_empty() {
                    return Err("Give the text to add.".into());
                }
                let saved = append(&project, id, text).map_err(english)?;
                post(json!({ "type": "changed", "to": "*", "project": project }));
                Ok(format!("Added to the note {} “{}”.", saved.id, note::title(&saved.text)))
            }
            _ => Err(format!("Unknown tool {name}.")),
        }
    }
}

squadron_extension!(Notes);
