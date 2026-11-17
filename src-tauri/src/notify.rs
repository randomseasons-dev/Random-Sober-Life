//! Daily summary notification. The UI sends the journey numbers (start, erased time, money rates,
//! currency format); a background thread fires once a day at the chosen time while the tray app runs.
use chrono::{Datelike, Local, TimeZone, Timelike};
use serde_json::Value;
use std::sync::Mutex;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

const DAY: f64 = 86_400_000.0;
const HOUR: f64 = 3_600_000.0;

static STATE: Mutex<Option<(Value, String)>> = Mutex::new(None); // (config, last date sent "YYYY-MM-DD")

fn file(app: &AppHandle) -> std::path::PathBuf {
    crate::data_dir(app).join("notify.json")
}

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn save(app: &AppHandle, cfg: &Value, last: &str) {
    let j = serde_json::json!({"cfg": cfg, "last": last});
    let _ = crate::write_atomic(&file(app), &j.to_string());
}

fn due_minutes(cfg: &Value) -> i64 {
    cfg["h"].as_i64().unwrap_or(8) * 60 + cfg["m"].as_i64().unwrap_or(0)
}

pub fn set_config(app: &AppHandle, cfg: &str) {
    let Ok(v) = serde_json::from_str::<Value>(cfg) else { return };
    let mut st = STATE.lock().unwrap();
    let mut last = st.as_ref().map(|s| s.1.clone()).unwrap_or_default();
    // first ever config after the chosen time: start tomorrow instead of firing straight away
    let n = Local::now();
    if last.is_empty() && (n.hour() as i64 * 60 + n.minute() as i64) >= due_minutes(&v) {
        last = today();
    }
    save(app, &v, &last);
    *st = Some((v, last));
}

pub fn start(app: AppHandle) {
    if let Ok(s) = std::fs::read_to_string(file(&app)) {
        if let Ok(j) = serde_json::from_str::<Value>(&s) {
            *STATE.lock().unwrap() = Some((j["cfg"].clone(), j["last"].as_str().unwrap_or("").to_string()));
        }
    }
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(30));
        let fire = {
            let mut st = STATE.lock().unwrap();
            match st.as_mut() {
                Some((cfg, last)) if cfg["on"].as_bool().unwrap_or(false) => {
                    let n = Local::now();
                    let mins = n.hour() as i64 * 60 + n.minute() as i64;
                    let t = today();
                    if mins >= due_minutes(cfg) && *last != t {
                        *last = t.clone();
                        save(&app, cfg, &t);
                        Some(cfg.clone())
                    } else {
                        None
                    }
                }
                _ => None,
            }
        };
        if let Some(cfg) = fire {
            let (title, body) = summary(&cfg);
            let _ = app.notification().builder().title(title).body(body).show();
        }
    });
}

fn now_ms() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64
}

fn money_between(rates: &[f64; 7], t0: f64, t1: f64) -> f64 {
    if t1 <= t0 {
        return 0.0;
    }
    if rates.iter().all(|r| *r == rates[0]) {
        return (t1 - t0) / DAY * rates[0];
    }
    let mut sum = 0.0;
    let mut cur = t0;
    let mut guard = 0;
    while cur < t1 && guard < 50_000 {
        guard += 1;
        let Some(d) = Local.timestamp_millis_opt(cur as i64).single() else { break };
        let next = d
            .date_naive()
            .succ_opt()
            .and_then(|nd| nd.and_hms_opt(0, 0, 0))
            .and_then(|nd| Local.from_local_datetime(&nd).earliest())
            .map(|x| x.timestamp_millis() as f64)
            .unwrap_or(cur + DAY);
        let end = next.min(t1);
        sum += (end - cur) / DAY * rates[d.weekday().num_days_from_sunday() as usize];
        cur = end;
    }
    sum
}

fn fmt_money(v: f64, f: &Value) -> String {
    let d = f["d"].as_u64().unwrap_or(2) as usize;
    let s = format!("{:.*}", d, (v * 10f64.powi(d as i32)).floor() / 10f64.powi(d as i32));
    let (int, frac) = s.split_once('.').map(|(a, b)| (a.to_string(), b.to_string())).unwrap_or((s.clone(), String::new()));
    let grp = f["grp"].as_str().unwrap_or(",");
    let mut out = String::new();
    for (i, c) in int.chars().enumerate() {
        if i > 0 && (int.len() - i) % 3 == 0 {
            out.push_str(grp);
        }
        out.push(c);
    }
    if d > 0 {
        out.push_str(f["dec"].as_str().unwrap_or("."));
        out.push_str(&frac);
    }
    format!("{}{}{}", f["pre"].as_str().unwrap_or(""), out, f["suf"].as_str().unwrap_or(""))
}

fn fmt_dur(ms: f64) -> String {
    let days = ms / DAY;
    if ms < DAY {
        return format!("{}h", (ms / HOUR).floor());
    }
    if days < 30.0 {
        return format!("{}d {}h", days.floor(), ((ms % DAY) / HOUR).floor());
    }
    let y = (days / 365.2425).floor();
    let mo = ((days - y * 365.2425) / 30.436875).floor();
    let d = (days - y * 365.2425 - mo * 30.436875).floor();
    if y > 0.0 {
        format!("{y}y {mo}mo")
    } else {
        format!("{mo}mo {d}d")
    }
}

fn summary(cfg: &Value) -> (String, String) {
    let n = now_ms();
    let start = cfg["start"].as_f64().unwrap_or(n);
    let erased = cfg["erased"].as_f64().unwrap_or(0.0);
    let streak = (n - cfg["streakStart"].as_f64().unwrap_or(n)).max(0.0);
    let total = (n - start - erased).max(0.0);
    let mut rates = [0f64; 7];
    if let Some(a) = cfg["rates"].as_array() {
        for (i, r) in a.iter().take(7).enumerate() {
            rates[i] = r.as_f64().unwrap_or(0.0);
        }
    }
    let avg = rates.iter().sum::<f64>() / 7.0;
    let money = (money_between(&rates, start, n) - erased / DAY * avg).max(0.0);
    let mut next = String::new();
    if let Some(m) = cfg["miles"].as_array() {
        for x in m {
            let d = x[0].as_f64().unwrap_or(0.0) * DAY;
            if d > total {
                next = format!(" Next medal: {} in {}.", x[1].as_str().unwrap_or(""), fmt_dur(d - total));
                break;
            }
        }
    }
    let title = format!("Day {} of your sober journey", (total / DAY).floor() as i64 + 1);
    let body = format!(
        "Sober {} · {} saved · current streak {}.{}",
        fmt_dur(total),
        fmt_money(money, &cfg["fmt"]),
        fmt_dur(streak),
        next
    );
    (title, body)
}
