const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_ROLLEN = ["Bauleiter", "Geschäftsführer"];

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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

async function sbAuthAdmin(path, options) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options && options.headers),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.msg || body.message || body.error_description || `Supabase Auth ${path} -> HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function getCallerEmail(callerToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${callerToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email ? String(user.email).trim().toLowerCase() : null;
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: "Server nicht korrekt konfiguriert." });
  }

  const authHeader = req.headers.get("authorization") || "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!callerToken) return json(401, { error: "Nicht angemeldet." });

  const callerEmail = await getCallerEmail(callerToken);
  if (!callerEmail) return json(401, { error: "Anmeldung ungültig oder abgelaufen." });

  let payload;
  try {
    const rows = await sbRest("erm_data?id=eq.1&select=payload");
    payload = rows && rows[0] ? rows[0].payload : {};
  } catch (e) {
    return json(500, { error: "Firmendaten konnten nicht geladen werden." });
  }
  const mitarbeiter = (payload && payload.mitarbeiter) || [];
  const caller = mitarbeiter.find(
    (m) => m.status !== "inaktiv" && String(m.email || "").trim().toLowerCase() === callerEmail
  );
  if (!caller || !ADMIN_ROLLEN.includes(caller.rolle)) {
    return json(403, { error: "Keine Berechtigung für diese Aktion." });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { error: "Ungültige Anfrage." });
  }
  const { action } = body || {};

  if (action === "create") {
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!email || password.length < 6) {
      return json(400, { error: "E-Mail und ein Passwort mit mind. 6 Zeichen sind erforderlich." });
    }
    try {
      const user = await sbAuthAdmin("admin/users", {
        method: "POST",
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      return json(200, { ok: true, authUserId: user.id });
    } catch (e) {
      if (e.status === 422 || /already.*registered/i.test(e.message || "")) {
        return json(409, { error: "Für diese E-Mail existiert bereits ein Konto." });
      }
      return json(500, { error: "Konto konnte nicht erstellt werden: " + e.message });
    }
  }

  if (action === "reset_password") {
    const authUserId = String(body.authUserId || "");
    const password = String(body.password || "");
    if (!authUserId || password.length < 6) {
      return json(400, { error: "Konto-ID und ein Passwort mit mind. 6 Zeichen sind erforderlich." });
    }
    try {
      await sbAuthAdmin(`admin/users/${authUserId}`, {
        method: "PUT",
        body: JSON.stringify({ password }),
      });
      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: "Passwort konnte nicht zurückgesetzt werden: " + e.message });
    }
  }

  if (action === "disable") {
    const authUserId = String(body.authUserId || "");
    if (!authUserId) return json(400, { error: "Konto-ID fehlt." });
    try {
      await sbAuthAdmin(`admin/users/${authUserId}`, {
        method: "PUT",
        body: JSON.stringify({ ban_duration: "876000h" }),
      });
      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: "Konto konnte nicht gesperrt werden: " + e.message });
    }
  }

  return json(400, { error: "Unbekannte Aktion." });
};
