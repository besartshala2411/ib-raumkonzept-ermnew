import webpush from "web-push";

export const config = { schedule: "0 6 * * *" };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:info@example.com";

async function sbRest(path, options) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options && options.headers),
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function isTodayMonthDay(iso, today) {
  if (!iso) return false;
  return iso.slice(5, 10) === today.slice(5, 10);
}

function buildReminders(payload) {
  const today = todayISO();
  const reminders = [];

  (payload.rechnungen || []).forEach((r) => {
    if (r.status !== "bezahlt" && r.faellig && r.faellig < today) {
      const kunde = (payload.kunden || []).find((k) => k.id === r.kundeId);
      reminders.push({ title: "Rechnung überfällig", body: `${r.nr} – ${kunde ? kunde.name : "Kunde"} ist überfällig.`, tag: "rechnung-" + r.id });
    }
  });

  (payload.mitarbeiter || []).forEach((m) => {
    if (isTodayMonthDay(m.geburtstag, today)) {
      reminders.push({ title: "🎂 Geburtstag heute", body: `${m.name} hat heute Geburtstag.`, tag: "geburtstag-" + m.id + "-" + today });
    }
  });

  (payload.fuhrpark || []).forEach((f) => {
    if (!f.tuev) return;
    const days = Math.floor((new Date(f.tuev) - new Date(today)) / 86400000);
    if (days >= 0 && days <= 14) {
      reminders.push({ title: "TÜV-Frist läuft bald ab", body: `${f.kennzeichen}: TÜV fällig am ${f.tuev}.`, tag: "tuev-" + f.id });
    } else if (days < 0) {
      reminders.push({ title: "TÜV-Frist überschritten", body: `${f.kennzeichen}: TÜV war am ${f.tuev} fällig.`, tag: "tuev-abgelaufen-" + f.id });
    }
  });

  return reminders;
}

export default async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response("Supabase env vars missing, skipping.", { status: 200 });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response("VAPID keys missing, skipping.", { status: 200 });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const rows = await sbRest("erm_data?id=eq.1&select=payload");
  const payload = rows && rows[0] ? rows[0].payload : {};
  const reminders = buildReminders(payload || {});

  if (!reminders.length) {
    return new Response("No reminders today.", { status: 200 });
  }

  const subs = await sbRest("push_subscriptions?select=endpoint,p256dh,auth");
  let sent = 0, cleaned = 0;

  for (const sub of subs || []) {
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    for (const reminder of reminders) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(reminder));
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          try {
            await sbRest(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
            cleaned++;
          } catch (delErr) {
            console.error("Failed to clean up expired subscription:", delErr.message);
          }
        } else {
          console.error("Push send failed:", err.message);
        }
      }
    }
  }

  return new Response(`Sent ${sent} notifications, cleaned up ${cleaned} expired subscriptions.`, { status: 200 });
};
