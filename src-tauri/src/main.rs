use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
struct ParsedCsv {
    headers: Vec<String>,
    rows: Vec<BTreeMap<String, String>>,
}

#[tauri::command]
fn parse_csv(text: String) -> Result<ParsedCsv, String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(text.as_bytes());

    let headers = reader
        .headers()
        .map_err(|error| error.to_string())?
        .iter()
        .map(|header| header.trim().to_string())
        .collect::<Vec<_>>();

    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        let mut row = BTreeMap::new();
        for (index, header) in headers.iter().enumerate() {
            row.insert(header.clone(), record.get(index).unwrap_or("").trim().to_string());
        }
        if row.values().any(|value| !value.is_empty()) {
            rows.push(row);
        }
    }

    Ok(ParsedCsv { headers, rows })
}

#[tauri::command]
fn db_load_state() -> Result<Option<String>, String> {
    let conn = open_database()?;
    run_migrations(&conn)?;

    let mut statement = conn
        .prepare("select state from app_state where id = 1")
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    match rows.next().map_err(|error| error.to_string())? {
        Some(row) => Ok(Some(row.get(0).map_err(|error| error.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
fn db_save_state(state: String) -> Result<(), String> {
    let conn = open_database()?;
    run_migrations(&conn)?;
    conn.execute(
        "insert into app_state (id, state) values (1, ?1) on conflict(id) do update set state = excluded.state",
        params![state],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn open_database() -> Result<Connection, String> {
    let dir = app_data_dir()?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Connection::open(dir.join("reports-master.sqlite")).map_err(|error| error.to_string())
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "create table if not exists migrations (id text primary key, applied_at text not null default current_timestamp)",
        [],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "create table if not exists app_state (id integer primary key check (id = 1), state text not null)",
        [],
    )
    .map_err(|error| error.to_string())?;

    let applied: i64 = conn
        .query_row(
            "select count(*) from migrations where id = '001_initial'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if applied == 0 {
        conn.execute_batch(include_str!("../migrations/001_initial.sql"))
            .map_err(|error| error.to_string())?;
        conn.execute("insert into migrations (id) values ('001_initial')", [])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn app_data_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|path| path.join("Reports Master"))
        .ok_or_else(|| "Could not resolve local app data directory".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            parse_csv,
            db_load_state,
            db_save_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reports Master");
}

fn main() {
    run();
}
