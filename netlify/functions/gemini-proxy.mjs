const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function getCallerUser(token) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function cleanBase64(value) {
  const s = String(value || "");
  const comma = s.indexOf(",");
  return comma >= 0 ? s.slice(comma + 1) : s;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Nur POST erlaubt." });
  if (!GEMINI_API_KEY) return json(500, { error: "GEMINI_API_KEY ist auf Netlify nicht hinterlegt." });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Server-Authentifizierung ist nicht konfiguriert." });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Nicht angemeldet." });

  const caller = await getCallerUser(token);
  if (!caller || !caller.id) return json(401, { error: "Anmeldung ungültig oder abgelaufen." });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Ungültige Anfrage." });
  }

  const prompt = String(body && body.prompt || "").trim();
  if (!prompt) return json(400, { error: "Prompt fehlt." });
  if (prompt.length > 30000) return json(413, { error: "Prompt ist zu groß." });

  const parts = [{ text: prompt }];
  const file = body && body.file;
  let tempStoragePath = null;

  if (file && file.storagePath) {
    tempStoragePath = String(file.storagePath);
    const objectUrl = `${SUPABASE_URL}/storage/v1/object/project-chat/${tempStoragePath.split("/").map(encodeURIComponent).join("/")}`;
    const fileRes = await fetch(objectUrl, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!fileRes.ok) {
      return json(400, { error: "Temporäre PDF konnte nicht aus dem Storage geladen werden." });
    }
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) {
      return json(413, { error: "PDF ist größer als 15 MB." });
    }
    parts.push({
      inline_data: {
        mime_type: String(file.mimeType || fileRes.headers.get("content-type") || "application/pdf"),
        data: bytes.toString("base64"),
      },
    });
  } else if (file && file.base64) {
    const base64 = cleanBase64(file.base64);
    if (base64.length > 28_000_000) {
      return json(413, { error: "Datei ist zu groß für die KI-Verarbeitung." });
    }
    parts.push({
      inline_data: {
        mime_type: String(file.mimeType || "application/pdf"),
        data: base64,
      },
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const requestBody = JSON.stringify({ contents: [{ parts }] });
    const delays = [0, 900, 2200, 4500];
    let lastStatus = 502;
    let lastMessage = "Gemini derzeit nicht erreichbar.";

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const text =
          data &&
          Array.isArray(data.candidates) &&
          data.candidates[0] &&
          data.candidates[0].content &&
          Array.isArray(data.candidates[0].content.parts)
            ? data.candidates[0].content.parts.map((p) => p.text || "").join("")
            : "";
        if (!text) return json(502, { error: "Keine Antwort von Gemini erhalten." });
        return json(200, { ok: true, text, attempts: attempt + 1 });
      }

      lastStatus = res.status;
      lastMessage =
        data?.error?.message ||
        data?.message ||
        `Gemini HTTP ${res.status}`;

      const retryable =
        res.status === 429 ||
        res.status === 500 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        /high demand|temporar|overload|unavailable|try again/i.test(String(lastMessage));

      if (!retryable) {
        return json(res.status >= 400 && res.status < 600 ? res.status : 502, {
          error: String(lastMessage).slice(0, 500),
        });
      }
    }

    return json(lastStatus >= 400 && lastStatus < 600 ? lastStatus : 503, {
      error: "Gemini ist momentan stark ausgelastet. Es wurden automatisch mehrere Versuche durchgeführt. Bitte in ein paar Minuten erneut versuchen.",
    });
  } catch (e) {
    return json(502, { error: "Gemini-Anfrage fehlgeschlagen: " + String(e && e.message || e).slice(0, 300) });
  } finally {
    if (tempStoragePath) {
      const objectUrl = `${SUPABASE_URL}/storage/v1/object/project-chat/${tempStoragePath.split("/").map(encodeURIComponent).join("/")}`;
      fetch(objectUrl, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }).catch(() => {});
    }
  }
};
