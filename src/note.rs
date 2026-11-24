use serde::{Deserialize, Serialize};

// One note must not fill the 1 MB Squadron keeps for the extension.
pub const MAX_LEN: usize = 100_000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Note {
    pub id: String,
    pub text: String,
    pub at: u64,
    #[serde(default)]
    pub pinned: bool,
}

pub fn title(text: &str) -> String {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or_default();
    line.trim_start_matches('#').trim().chars().take(80).collect()
}

pub fn new_id(notes: &[Note], now: u64) -> String {
    let mut n = now;
    loop {
        let id = format!("{n:x}");
        if !notes.iter().any(|x| x.id == id) {
            return id;
        }
        n += 1;
    }
}

pub fn appended(text: &str, add: &str) -> String {
    let text = text.trim_end();
    if text.is_empty() { add.trim().to_string() } else { format!("{text}\n\n{}", add.trim()) }
}

pub fn merge(saved: &str, base: &str, mine: &str) -> (String, Option<String>) {
    if saved == base || saved == mine {
        (mine.to_string(), None)
    } else if let Some(added) = saved.strip_prefix(base) {
        (format!("{}{added}", mine.trim_end()), None)
    } else {
        (mine.to_string(), Some(saved.to_string()))
    }
}

pub fn sorted(mut notes: Vec<Note>) -> Vec<Note> {
    notes.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.at.cmp(&a.at)));
    notes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(id: &str, at: u64) -> Note {
        Note { id: id.into(), text: String::new(), at, pinned: false }
    }

    #[test]
    fn title_is_the_first_written_line() {
        assert_eq!(title("\n  \n## Deploy steps \nmore"), "Deploy steps");
        assert_eq!(title(""), "");
        assert_eq!(title(&"a".repeat(200)).len(), 80);
    }

    #[test]
    fn ids_never_collide() {
        assert_eq!(new_id(&[note("a", 0), note("b", 0)], 10), "c");
    }

    #[test]
    fn append_leaves_a_blank_line() {
        assert_eq!(appended("", " first "), "first");
        assert_eq!(appended("one\n\n", "two"), "one\n\ntwo");
    }

    #[test]
    fn merge_keeps_what_both_wrote() {
        assert_eq!(merge("a", "a", "ab"), ("ab".into(), None));
        assert_eq!(merge("a\n\nagent", "a", "a user"), ("a user\n\nagent".into(), None));
        assert_eq!(merge("other", "a", "ab"), ("ab".into(), Some("other".into())));
        assert_eq!(merge("same", "a", "same"), ("same".into(), None));
    }

    #[test]
    fn newest_first() {
        let ids: Vec<String> = sorted(vec![note("old", 1), note("new", 3), note("mid", 2)]).into_iter().map(|n| n.id).collect();
        assert_eq!(ids, ["new", "mid", "old"]);
    }

    #[test]
    fn pinned_first_and_old_notes_still_load() {
        let mut old = note("old", 1);
        old.pinned = true;
        let ids: Vec<String> = sorted(vec![note("new", 3), old]).into_iter().map(|n| n.id).collect();
        assert_eq!(ids, ["old", "new"]);
        let saved: Vec<Note> = serde_json::from_str(r#"[{"id":"a","text":"t","at":1}]"#).unwrap();
        assert!(!saved[0].pinned);
    }
}
