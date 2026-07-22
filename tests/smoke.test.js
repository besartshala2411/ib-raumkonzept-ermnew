const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const APP_PATH = path.join(__dirname, "..", "index.html");
let html = fs.readFileSync(APP_PATH, "utf8");
// Strip external CDN <script src> tags — offline sandbox, and app already
// feature-detects window.jspdf / window.QRCode / window.supabase before use.
html = html.replace(/<script src="https:[^>]*><\/script>\s*/g, "");

let failures = 0, passed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  OK  " + msg); }
  else { failures++; console.log("  FAIL " + msg); }
}

async function main() {
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    resources: "usable",
    beforeParse(window) {
      const FDBFactory = require("fake-indexeddb/lib/FDBFactory").default || require("fake-indexeddb/lib/FDBFactory");
      window.indexedDB = new FDBFactory();
      window.scrollTo = () => {};
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));
      window.navigator.serviceWorker = { register: () => Promise.resolve({}), ready: Promise.resolve({}) };
      // jsdom has no canvas backend without native deps; stub a no-op 2D context
      // so branding/signature/image-compression code paths don't throw during the test.
      const fakeCtx = {
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {}, fillText: () => {}, drawImage: () => {}, beginPath: () => {},
        moveTo: () => {}, lineTo: () => {}, stroke: () => {}, clearRect: () => {},
        set fillStyle(v) {}, set strokeStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}, set lineWidth(v) {}, set lineCap(v) {},
      };
      window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
      window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAAA";
      window.URL.createObjectURL = () => "blob:http://localhost/fake-" + Math.random();
      window.URL.revokeObjectURL = () => {};
    },
  });
  const { window } = dom;
  window.onerror = (msg) => { console.log("  WINDOW ERROR: " + msg); failures++; };

  // wait for DOMContentLoaded-driven boot() to finish (it's async: waits briefly for the
  // Supabase SDK, then checks for a session before deciding what to render into #loginBody)
  await new Promise((resolve) => {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const body = window.document.getElementById("loginBody");
      if ((body && !body.innerHTML.includes("Lädt")) || tries > 100) { clearInterval(iv); resolve(); }
    }, 50);
  });

  console.log("\n== Boot & Login ==");
  assert(!!window.document.getElementById("loginScreen"), "Login-Screen vorhanden");
  assert(window.MODULES && window.MODULES.length >= 20, "Alle Module registriert (" + (window.MODULES ? window.MODULES.length : 0) + ")");
  assert(typeof window.S === "object", "State S initialisiert");

  window.S.mitarbeiter.push({ id: "m1", name: "Max Mustermann", position: "Vorarbeiter", rolle: "Geschäftsführer", tel: "", email: "max@example.com", adresse: "", eintritt: "2024-01-01", status: "aktiv", urlaubstageJahr: 30, stundenlohn: 20, dokumente: [] });
  window.S.currentUserId = "m1";
  window.enterApp();
  assert(window.document.getElementById("appShell").classList.contains("hidden") === false, "App-Shell nach Login sichtbar");
  assert(window.hasAdminAccess() === true, "Simulierter Geschäftsführer-Login hat Admin-Zugriff (für restliche Testsuite)");

  console.log("\n== Login: E-Mail/Passwort, Konto-Zuordnung ==");
  window.renderLogin();
  assert(window.document.getElementById("loginBody").innerHTML.includes("nicht verfügbar"), "Login zeigt 'nicht verfügbar', wenn window.supabase fehlt (CDN im Test entfernt)");

  const fakeSbClient = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInWithPassword: async () => ({ data: {}, error: null }),
      signOut: async () => ({}),
    },
    // Vollständig genug, damit initCloudSyncIfEnabled()/subscribeRealtime() (von enterApp()
    // im Hintergrund angestoßen) nicht mit einer unbehandelten Exception/Rejection abbrechen.
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  };
  window.supabase = { createClient: () => fakeSbClient };
  window.renderLogin();
  assert(window.document.getElementById("loginEmail") !== null && window.document.getElementById("loginPassword") !== null, "Login zeigt E-Mail/Passwort-Formular, wenn Supabase verfügbar ist");

  const wasCloudSyncEnabled = window.LC.cloudSyncEnabled;
  window.LC.cloudSyncEnabled = false; // isoliert resolveAndEnter() von echten Netzwerk-Pulls im Test

  await window.resolveAndEnter({ user: { email: "MAX@EXAMPLE.COM" } });
  assert(window.S.currentUserId === "m1", "resolveAndEnter() matched E-Mail case-insensitiv gegen aktiven Mitarbeiter");

  await window.resolveAndEnter({ user: { email: "nobody@example.com" } });
  assert(window.document.getElementById("loginBody").innerHTML.includes("keinem aktiven Mitarbeiter zugeordnet"), "resolveAndEnter() ohne Treffer zeigt Sperrbildschirm");

  window.S.mitarbeiter.push({ id: "inaktivTest", name: "Ex Mitarbeiter", position: "", rolle: "Mitarbeiter", tel: "", email: "ex@example.com", adresse: "", eintritt: "2024-01-01", status: "inaktiv", urlaubstageJahr: 30, stundenlohn: 20, dokumente: [] });
  await window.resolveAndEnter({ user: { email: "ex@example.com" } });
  assert(window.document.getElementById("loginBody").innerHTML.includes("keinem aktiven Mitarbeiter zugeordnet"), "resolveAndEnter() blockiert Konten inaktiver Mitarbeiter");
  window.S.mitarbeiter = window.S.mitarbeiter.filter((m) => m.id !== "inaktivTest");

  window.LC.cloudSyncEnabled = wasCloudSyncEnabled;
  window.S.currentUserId = "m1";
  window.enterApp();
  delete window.supabase;

  assert(window.ensureShape({ mitarbeiter: [{ id: "old1", name: "Alt" }] }).mitarbeiter[0].authUserId === null, "ensureShape() backfillt authUserId:null bei alten Mitarbeiter-Datensätzen");

  console.log("\n== Escaping-Regression (kritischer Bug aus der Praxis) ==");
  // Name enthält doppelte Anführungszeichen, einfache Anführungszeichen und < > &
  const evilName = `Ma"ler & <Söhne> 'GmbH'`;
  window.S.kunden.push({ id: "test-evil-1", name: evilName, ansprechpartner: "", tel: "", email: "", adresse: "", notizen: "" });
  let threw = false;
  try {
    window.renderKunden(window.document.getElementById("view"));
  } catch (e) { threw = true; console.log("  Exception: " + e.message); }
  assert(!threw, "renderKunden() wirft keine Exception bei Sonderzeichen im Namen");
  const viewHtml = window.document.getElementById("view").innerHTML;
  // Text-Knoten serialisieren Anführungszeichen unescaped zurück (spec-konform, nicht gefährlich);
  // sicherheitsrelevant ist nur, dass < > & korrekt escaped bleiben (kein Tag-Ausbruch/HTML-Injection).
  assert(viewHtml.includes("&lt;Söhne&gt;"), "Name in Tabellenzelle korrekt escaped (escHtml) – kein Tag-Ausbruch möglich");
  try {
    window.renderKunden(window.document.getElementById("view"), "test-evil-1", "stammdaten");
  } catch (e) { threw = true; console.log("  Exception bei renderKunden (Detail/Stammdaten): " + e.message); }
  const detailHtml = window.document.getElementById("view").innerHTML;
  assert(detailHtml.includes('value="Ma&quot;ler'), "Name im value-Attribut korrekt escAttr()-escaped (kein Attribut-Bruch)");
  assert(!detailHtml.includes('value="Ma"ler'), "Kein unescaped-Anführungszeichen, das das Attribut aufbricht");
  window.S.kunden = window.S.kunden.filter((k) => k.id !== "test-evil-1");

  console.log("\n== CRUD: Mitarbeiter ==");
  assert(window.S.mitarbeiter.length === 1, "Mitarbeiter hinzugefügt");
  window.route("#mitarbeiter");
  assert(window.document.getElementById("view").innerHTML.includes("Max Mustermann"), "Mitarbeiter erscheint in Liste");

  console.log("\n== Undo beim Löschen ==");
  window.S.aufgaben.push({ id: "ag1", titel: "Testaufgabe", beschreibung: "", faellig: "", prioritaet: "normal", projektId: null, zugeordnet: null, status: "offen" });
  window.deleteAufgabe("ag1");
  assert(!window.S.aufgaben.some((a) => a.id === "ag1"), "Aufgabe ist nach deleteAufgabe() sofort entfernt");
  let undoToasts = Array.from(window.document.querySelectorAll("#toastWrap .toastUndo"));
  assert(undoToasts.length === 1, "Undo-Toast mit Rückgängig-Button erscheint nach dem Löschen");
  undoToasts[0].querySelector("button").click();
  assert(window.S.aufgaben.some((a) => a.id === "ag1"), "Klick auf 'Rückgängig' stellt die gelöschte Aufgabe wieder her");
  assert(undoToasts[0].style.opacity === "0", "Undo-Toast beginnt nach Klick auszublenden");
  undoToasts[0].remove();
  window.S.aufgaben = window.S.aufgaben.filter((a) => a.id !== "ag1");

  window.S.projekte.push({ id: "pUndo", name: "Undo-Testprojekt", kundeId: "", adresse: "", status: "Aktiv", budget: 0, deadline: "", fortschritt: 0, team: [], subunternehmer: [], fotos: [], dokumente: [], material: [], bautagebuch: [], zugaenge: [], checkliste: [], aufmasse: [], bauzeitenplan: [{ id: "bp1", bezeichnung: "Testphase", von: "2026-01-01", bis: "2026-01-10", status: "geplant", fortschritt: 0 }], chat: [] });
  const testProjekt = window.S.projekte.find((p) => p.id === "pUndo");
  window.deleteBauphase("pUndo", "bp1");
  assert(testProjekt.bauzeitenplan.length === 0, "Bauphase (verschachteltes Projekt-Array) ist sofort entfernt");
  undoToasts = Array.from(window.document.querySelectorAll("#toastWrap .toastUndo"));
  assert(undoToasts.length === 1, "Undo-Toast erscheint auch für verschachtelte Projekt-Arrays");
  undoToasts[0].querySelector("button").click();
  assert(testProjekt.bauzeitenplan.length === 1 && testProjekt.bauzeitenplan[0].id === "bp1", "Rückgängig stellt die Bauphase im richtigen Projekt wieder her");
  undoToasts[0].remove();
  window.S.projekte = window.S.projekte.filter((p) => p.id !== "pUndo");

  window.S.mitarbeiter.push({ id: "mUndo", name: "Undo Testperson", position: "", tel: "", email: "", adresse: "", eintritt: "2024-01-01", status: "aktiv", urlaubstageJahr: 30, stundenlohn: 20, dokumente: [] });
  window.deleteMitarbeiter("mUndo");
  window.document.getElementById("confirmDelBtn").click();
  assert(!window.S.mitarbeiter.some((m) => m.id === "mUndo"), "Mitarbeiter ist nach Bestätigung im Löschen-Dialog entfernt");
  undoToasts = Array.from(window.document.querySelectorAll("#toastWrap .toastUndo"));
  assert(undoToasts.length === 1, "Undo-Toast erscheint auch nach confirmDelete()-bestätigtem Löschen");
  undoToasts[0].querySelector("button").click();
  assert(window.S.mitarbeiter.some((m) => m.id === "mUndo"), "Rückgängig stellt den über confirmDelete() gelöschten Mitarbeiter wieder her");
  window.S.mitarbeiter = window.S.mitarbeiter.filter((m) => m.id !== "mUndo");

  console.log("\n== Stempeluhr ==");
  window.stempelKommen("m1");
  assert(window.S.zeiterfassung.length === 1 && window.S.zeiterfassung[0].gehen === null, "Kommen gebucht");
  window.stempelGehen("m1");
  assert(window.S.zeiterfassung[0].gehen !== null, "Gehen gebucht");

  console.log("\n== Projekte & Aufmaß (Shoelace-Formel) ==");
  window.S.projekte.push({ id: "p1", name: "Testprojekt", kundeId: "", adresse: "", status: "Aktiv", budget: 1000, deadline: "", fortschritt: 10, team: [], subunternehmer: [], fotos: [], dokumente: [], material: [], bautagebuch: [], zugaenge: [], checkliste: [], aufmasse: [], bauzeitenplan: [], chat: [] });
  // 4m x 3m Rechteck -> Fläche 12 m², Umfang 14 m
  const raum = { id: "r1", name: "Wohnzimmer", hoehe: 2.5, abzuege: 0, segmente: [
    { laenge: 4, winkel: 90, drehrichtung: "CW" },
    { laenge: 3, winkel: 90, drehrichtung: "CW" },
    { laenge: 4, winkel: 90, drehrichtung: "CW" },
    { laenge: 3, winkel: 90, drehrichtung: "CW" },
  ]};
  const calc = window.calcRaum(raum);
  assert(Math.abs(calc.flaeche - 12) < 0.01, "Grundfläche Rechteck 4x3 = 12 m² (berechnet: " + calc.flaeche.toFixed(2) + ")");
  assert(Math.abs(calc.umfang - 14) < 0.01, "Umfang Rechteck 4x3 = 14 m (berechnet: " + calc.umfang.toFixed(2) + ")");
  assert(Math.abs(calc.wandflaeche - 35) < 0.01, "Wandfläche 14m x 2.5m = 35 m² (berechnet: " + calc.wandflaeche.toFixed(2) + ")");
  assert(calc.geschlossen === true, "Raum wird als geschlossen erkannt");

  console.log("\n== Rechnungen (Netto/MwSt/Brutto) ==");
  const rechnung = { id: "re1", nr: "RE-TEST-0001", kundeId: "", projektId: "", datum: "2026-01-01", faellig: "2026-01-15", status: "offen", positionen: [{ beschreibung: "Trockenbau", menge: 10, einheit: "m²", preis: 50 }], notiz: "" };
  assert(window.rechnungNetto(rechnung) === 500, "Netto = 500€");
  assert(Math.abs(window.rechnungMwst(rechnung) - 95) < 0.01, "MwSt 19% = 95€");
  assert(Math.abs(window.rechnungSumme(rechnung) - 595) < 0.01, "Brutto = 595€");

  console.log("\n== Storage Layer: sichtbare Fehlerbehandlung bei Speicherfehler ==");
  let toastMsgs = [];
  const origToast = window.toast;
  window.toast = (msg, type) => { toastMsgs.push({ msg, type }); };
  // localStorage.setItem und idbSet gleichzeitig zum Scheitern bringen -> muss sichtbaren Fehler zeigen.
  // Hinweis: Storage-Objekte sind Legacy-Platform-Objects mit eigenem [[Set]]-Trap, daher
  // funktioniert `localStorage.setItem = fn` nicht (das würde stattdessen einen Storage-Key
  // namens "setItem" anlegen) - die gesamte window.localStorage-Property muss ersetzt werden.
  const origDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage") || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { setItem: () => { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }, getItem: () => null, removeItem: () => {} },
  });
  const origIdbSet = window.idbSet;
  window.idbSet = () => Promise.reject(Object.assign(new Error("full"), { name: "QuotaExceededError" }));
  await window.persistState();
  assert(toastMsgs.some((t) => t.type === "error"), "Bei Speicherfehler (IDB+localStorage) wird sichtbarer Fehler-Toast gezeigt, kein stiller Fehlschlag");
  if (origDescriptor) Object.defineProperty(window, "localStorage", origDescriptor);
  window.idbSet = origIdbSet;
  window.toast = origToast;

  console.log("\n== Ensure-Shape / Lazy-Init (Abwärtskompatibilität) ==");
  const oldSavedProject = { id: "old1", name: "Altes Projekt" }; // fehlende Felder wie team, fotos etc.
  const fakeState = window.defaultState();
  fakeState.projekte.push(oldSavedProject);
  const shaped = window.ensureShape(fakeState);
  assert(Array.isArray(shaped.projekte[0].team) && Array.isArray(shaped.projekte[0].fotos) && Array.isArray(shaped.projekte[0].aufmasse), "Alte Projekt-Datensätze bekommen fehlende Arrays via ensureShape()");

  console.log("\n== Router / Alle Module rendern ohne Exception ==");
  for (const mod of window.MODULES) {
    let ok = true, errMsg = "";
    try { window.document.getElementById("view").innerHTML = ""; mod.render(window.document.getElementById("view")); }
    catch (e) { ok = false; errMsg = e.message; }
    assert(ok, "Modul '" + mod.id + "' rendert ohne Exception" + (ok ? "" : " (" + errMsg + ")"));
  }

  console.log("\n== Personalakte (Tabs, Pflichtdokumente, Vorname/Nachname) ==");
  const pk = window.S.mitarbeiter.find((x) => x.id === "m1");
  pk.vorname = "Max"; pk.nachname = "Mustermann";
  ["stammdaten", "dokumente", "stundenzettel", "urlaub", "lohn"].forEach((t) => {
    let ok = true, msg = "";
    try { window._pkTab = t; window.openPersonalakte("m1"); } catch (e) { ok = false; msg = e.message; }
    assert(ok, "Personalakte-Tab '" + t + "' rendert ohne Exception" + (ok ? "" : " (" + msg + ")"));
  });
  window.closeModal();
  const pflichtHtml = window.renderPflichtChecklist("mitarbeiter", "m1");
  assert(pflichtHtml.includes("Pflichtdokumente"), "Pflichtdokumente-Checkliste wird für Mitarbeiter gerendert");
  assert(pflichtHtml.includes("Personalausweis"), "Default-Pflichtdokumente-Liste enthält erwarteten Eintrag");

  console.log("\n== Subunternehmer- und Kunden-Detailseiten (Tabs) ==");
  window.S.subunternehmer.push({ id: "sub1", firma: "Testbau GmbH", ansprechpartner: "", tel: "", email: "", gewerk: "Elektro", notizen: "", dokumente: [] });
  ["dokumente", "stammdaten", "projekte", "notizen"].forEach((t) => {
    let ok = true, msg = "";
    try { window.document.getElementById("view").innerHTML = ""; window.renderSubunternehmer(window.document.getElementById("view"), "sub1", t); }
    catch (e) { ok = false; msg = e.message; }
    assert(ok, "Subunternehmer-Tab '" + t + "' rendert ohne Exception" + (ok ? "" : " (" + msg + ")"));
  });
  window.S.kunden.push({ id: "kd1", name: "Testkunde GmbH", ansprechpartner: "", tel: "", email: "", adresse: "", notizen: "", dokumente: [] });
  ["dokumente", "stammdaten", "projekte", "notizen"].forEach((t) => {
    let ok = true, msg = "";
    try { window.document.getElementById("view").innerHTML = ""; window.renderKunden(window.document.getElementById("view"), "kd1", t); }
    catch (e) { ok = false; msg = e.message; }
    assert(ok, "Kunden-Tab '" + t + "' rendert ohne Exception" + (ok ? "" : " (" + msg + ")"));
  });

  console.log("\n== Globale Suche ==");
  const gsIndex = window.globalSearchIndex();
  assert(gsIndex.some((it) => it.typ === "mitarbeiter" && it.id === "m1"), "Suchindex enthält Mitarbeiter");
  assert(gsIndex.some((it) => it.typ === "kunde" && it.id === "kd1"), "Suchindex enthält Kunden");
  assert(gsIndex.some((it) => it.typ === "subunternehmer" && it.id === "sub1"), "Suchindex enthält Subunternehmer");
  assert(gsIndex.some((it) => it.typ === "projekt" && it.id === "p1"), "Suchindex enthält Projekte");
  let gsOk = true, gsMsg = "";
  try { window.openGlobalSearch(); } catch (e) { gsOk = false; gsMsg = e.message; }
  assert(gsOk, "Suche-Modal öffnet ohne Exception" + (gsOk ? "" : " (" + gsMsg + ")"));
  assert(window.document.getElementById("gsInput") !== null, "Suche-Modal enthält Eingabefeld");
  window.renderGlobalSearchResults("Testkunde");
  let gsResultsHtml = window.document.getElementById("gsResults").innerHTML;
  assert(gsResultsHtml.includes("Testkunde GmbH"), "Suche nach 'Testkunde' findet den passenden Kunden");
  window.renderGlobalSearchResults("");
  gsResultsHtml = window.document.getElementById("gsResults").innerHTML;
  assert(!gsResultsHtml.includes("gsResultItem"), "Leere Suche zeigt keine Ergebnisliste, sondern einen Hinweis");
  window.renderGlobalSearchResults("Nichtvorhanden_xyz123");
  gsResultsHtml = window.document.getElementById("gsResults").innerHTML;
  assert(gsResultsHtml.includes("Keine Treffer"), "Suche ohne Treffer zeigt einen Hinweis");
  window.globalSearchOpenResult("kunde", "kd1");
  assert(window.location.hash.includes("kunden/kd1"), "Klick auf Suchergebnis 'Kunde' navigiert zur Kunden-Detailseite");
  assert(window.document.getElementById("modalOverlay") === null, "Suche-Modal schließt sich beim Navigieren zu einem Ergebnis");

  console.log("\n== Rollen-basierte Zugriffsrechte (Geschäftsführer/Bauleiter vs. Mitarbeiter) ==");
  window.S.rechnungen.push({ id: "re-role1", nr: "RE-ROLE-0001", kundeId: "", projektId: "", datum: "2026-01-01", faellig: "", status: "offen", positionen: [], notiz: "" });
  window.S.vertraege.push({ id: "vt-role1", mitarbeiterId: "m1", typ: "Arbeitsvertrag", inhalt: "", unterschriftAG: "", unterschriftAN: "", datum: "2026-01-01", status: "entwurf" });
  window.S.passwoerter.push({ id: "pw-role1", bezeichnung: "Testtresor", benutzername: "", passwort: "", url: "", notiz: "" });
  window.S.mitarbeiter.push({ id: "roleWorker", name: "Rolle Arbeiter", position: "Maler", rolle: "Mitarbeiter", tel: "", email: "arbeiter@example.com", adresse: "", eintritt: "2024-01-01", status: "aktiv", urlaubstageJahr: 30, stundenlohn: 20, dokumente: [] });
  window.S.mitarbeiter.push({ id: "roleBoss", name: "Rolle Chef", position: "Geschäftsführer", rolle: "Geschäftsführer", tel: "", email: "", adresse: "", eintritt: "2024-01-01", status: "aktiv", urlaubstageJahr: 30, stundenlohn: 20, dokumente: [] });

  window.S.currentUserId = null;
  assert(window.hasAdminAccess() === false, "Kein eingeloggter Mitarbeiter -> kein Admin-Zugriff (fail closed)");

  window.S.currentUserId = "roleWorker";
  assert(window.hasAdminAccess() === false, "Normaler Mitarbeiter hat keinen Admin-Zugriff");
  window.buildSidebar();
  let sidebarHtml = window.document.getElementById("sidebar").innerHTML;
  assert(!sidebarHtml.includes('data-route="rechnungen"'), "Sidebar blendet 'Rechnungen' für normalen Mitarbeiter aus");
  assert(!sidebarHtml.includes('data-route="passwoerter"'), "Sidebar blendet 'Passwörter' für normalen Mitarbeiter aus");
  assert(!sidebarHtml.includes('data-route="einstellungen"'), "Sidebar blendet 'Einstellungen' für normalen Mitarbeiter aus");
  assert(sidebarHtml.includes('data-route="projekte"'), "Sidebar zeigt weiterhin nicht eingeschränkte Module wie Projekte");

  window.route("#rechnungen");
  assert(window.document.getElementById("view").innerHTML.includes("nur für Geschäftsführung"), "Direkter Aufruf von #rechnungen wird für normalen Mitarbeiter blockiert");

  const gsIndexWorker = window.globalSearchIndex();
  assert(!gsIndexWorker.some((it) => it.typ === "rechnung"), "Suchindex enthält für normalen Mitarbeiter keine Rechnungen");
  assert(!gsIndexWorker.some((it) => it.typ === "vertrag"), "Suchindex enthält für normalen Mitarbeiter keine Verträge");
  assert(!gsIndexWorker.some((it) => it.typ === "passwort"), "Suchindex enthält für normalen Mitarbeiter keine Passwörter");

  window.document.getElementById("view").innerHTML = "";
  window.renderDashboard(window.document.getElementById("view"));
  const dashHtmlWorker = window.document.getElementById("view").innerHTML;
  assert(!dashHtmlWorker.includes("Offene Beträge"), "Dashboard blendet 'Offene Beträge'-KPI für normalen Mitarbeiter aus");

  window.renderTicker();
  const tickerHtmlWorker = window.document.getElementById("ticker").innerHTML;
  assert(!tickerHtmlWorker.includes(">offen<"), "Ticker blendet offene Rechnungsbeträge für normalen Mitarbeiter aus");

  window._pkTab = "lohn";
  window.openPersonalakte("roleWorker");
  const pkHtmlWorker = window.document.getElementById("modalOverlay").innerHTML;
  assert(!pkHtmlWorker.includes("💶 Lohn"), "Personalakte-Tabs zeigen 'Lohn' nicht für normalen Mitarbeiter");
  assert(!pkHtmlWorker.includes("Geschätzter Stundenlohn"), "Lohn-Tab-Inhalt wird nicht gerendert (Fallback auf Stammdaten)");
  assert(!pkHtmlWorker.includes('id="mBrutto"') && !pkHtmlWorker.includes('id="mLohn"'), "Brutto/Stundenlohn-Felder fehlen in Stammdaten für normalen Mitarbeiter");
  assert(window.renderMitarbeiterAccountBlock(window.S.mitarbeiter.find((x) => x.id === "roleWorker")) === "", "Konto-Block ist für normale Mitarbeiter (nicht-Admin) leer");
  window.closeModal();

  window.S.currentUserId = "roleBoss";
  assert(window.hasAdminAccess() === true, "Geschäftsführer-Rolle hat Admin-Zugriff");
  const roleWorkerRecord = window.S.mitarbeiter.find((x) => x.id === "roleWorker");
  let acctBlockHtml = window.renderMitarbeiterAccountBlock(roleWorkerRecord);
  assert(acctBlockHtml.includes("Konto erstellen") && !acctBlockHtml.includes("Passwort zurücksetzen"), "Konto-Block zeigt 'Konto erstellen' für Admins bei Mitarbeitern ohne Konto");
  roleWorkerRecord.authUserId = "fake-auth-user-id";
  acctBlockHtml = window.renderMitarbeiterAccountBlock(roleWorkerRecord);
  assert(acctBlockHtml.includes("Passwort zurücksetzen") && !acctBlockHtml.includes("Konto erstellen"), "Konto-Block zeigt 'Passwort zurücksetzen', sobald ein Konto existiert");
  window.buildSidebar();
  const sidebarBossHtml = window.document.getElementById("sidebar").innerHTML;
  assert(sidebarBossHtml.includes('data-route="rechnungen"'), "Sidebar zeigt 'Rechnungen' für Geschäftsführer");
  window.route("#rechnungen");
  assert(!window.document.getElementById("view").innerHTML.includes("nur für Geschäftsführung"), "Geschäftsführer kann #rechnungen normal aufrufen");

  window.S.currentUserId = "m1";
  window.S.mitarbeiter = window.S.mitarbeiter.filter((m) => !["roleWorker", "roleBoss"].includes(m.id));
  window.S.rechnungen = window.S.rechnungen.filter((r) => r.id !== "re-role1");
  window.S.vertraege = window.S.vertraege.filter((v) => v.id !== "vt-role1");
  window.S.passwoerter = window.S.passwoerter.filter((p) => p.id !== "pw-role1");
  window.buildSidebar();
  window.route("#dashboard");

  console.log("\n== Projekt <-> Subunternehmer Zuordnung ==");
  window.addSubToProjekt("sub1", "p1");
  assert(window.S.projekte.find((p) => p.id === "p1").subunternehmer.includes("sub1"), "Subunternehmer wird dem Projekt zugeordnet");
  window.removeSubFromProjekt("sub1", "p1");
  assert(!window.S.projekte.find((p) => p.id === "p1").subunternehmer.includes("sub1"), "Subunternehmer-Zuordnung wird wieder entfernt");

  console.log("\n== Bauzeitenplan (Gantt, Phasen-Verwaltung, PDF-Export) ==");
  let bzOk = true, bzMsg = "";
  try { window.document.getElementById("view").innerHTML = ""; window.renderProjekte(window.document.getElementById("view"), "p1", "bauzeitenplan"); }
  catch (e) { bzOk = false; bzMsg = e.message; }
  assert(bzOk, "Bauzeitenplan-Tab rendert ohne Exception (leer)" + (bzOk ? "" : " (" + bzMsg + ")"));
  const bzTabHtml = window.document.getElementById("view").innerHTML;
  assert(bzTabHtml.includes("#projekte/p1/bauzeitenplan") && bzTabHtml.includes("Bauzeitenplan"), "Bauzeitenplan ist als Projekt-Tab registriert und verlinkt");
  assert(bzTabHtml.includes("Noch keine Phasen geplant"), "Leerer Bauzeitenplan zeigt Hinweistext");

  // effective status: fertig überschreibt alles, überfällige Bis-Daten werden "verzögert"
  assert(window.bauphaseEffectiveStatus({ status: "fertig", bis: "2020-01-01" }) === "fertig", "Status 'fertig' bleibt fertig, auch wenn Bis in Vergangenheit liegt");
  assert(window.bauphaseEffectiveStatus({ status: "läuft", bis: "2020-01-01" }) === "verzögert", "Überfällige, nicht fertige Phase gilt als 'verzögert'");
  assert(window.bauphaseEffectiveStatus({ status: "geplant", bis: "2099-01-01" }) === "geplant", "Zukünftige Phase behält ihren Status");
  assert(window.bauphaseBarColor("läuft") === "var(--primary)" && window.bauphaseBarColor("verzögert") === "var(--red)", "bauphaseBarColor() liefert gültige CSS var()-Ausdrücke (keine erfundenen --gray/--blue Variablen)");

  window.openBauphaseForm("p1");
  window.document.getElementById("bpBez").value = "Trockenbau EG";
  window.document.getElementById("bpVon").value = "2026-08-01";
  window.document.getElementById("bpBis").value = "2026-08-10";
  window.document.getElementById("bpStatus").value = "läuft";
  window.document.getElementById("bpFortschritt").value = "40";
  window.saveBauphase("p1", window._newBauphaseDraft.id, false);
  assert(window.S.projekte.find((p) => p.id === "p1").bauzeitenplan.length === 1, "Neue Bauphase wird zum Projekt hinzugefügt");
  window.renderProjekte(window.document.getElementById("view"), "p1", "bauzeitenplan");
  const bzView = window.document.getElementById("view").innerHTML;
  assert(bzView.includes("Trockenbau EG") && bzView.includes("40%"), "Gantt/Tabelle zeigt neue Phase mit Bezeichnung und Fortschritt");
  assert(bzView.includes("exportBauzeitenplanPDF"), "Bauzeitenplan hat PDF-Export-Button");

  const bzPhaseId = window.S.projekte.find((p) => p.id === "p1").bauzeitenplan[0].id;
  window.deleteBauphase("p1", bzPhaseId);
  assert(window.S.projekte.find((p) => p.id === "p1").bauzeitenplan.length === 0, "Bauphase kann wieder gelöscht werden");

  console.log("\n== Projekt-Übersicht: verknüpfte Aufgaben & Rechnungen ==");
  window.S.aufgaben.push({ id: "ag-ueb1", titel: "Fenster bestellen", beschreibung: "", faellig: "", prioritaet: "mittel", projektId: "p1", zugeordnet: null, status: "offen" });
  window.S.rechnungen.push({ id: "re-ueb1", nr: "RE-UEB-0001", kundeId: "", projektId: "p1", datum: "2026-01-01", faellig: "2099-01-01", status: "offen", positionen: [{ beschreibung: "Trockenbau", menge: 5, einheit: "m²", preis: 40 }], notiz: "" });
  window.document.getElementById("view").innerHTML = "";
  window.renderProjekte(window.document.getElementById("view"), "p1", "uebersicht");
  let uebHtml = window.document.getElementById("view").innerHTML;
  assert(uebHtml.includes("Fenster bestellen"), "Übersicht zeigt verknüpfte offene Aufgabe des Projekts");
  assert(uebHtml.includes("RE-UEB-0001"), "Übersicht zeigt verknüpfte Rechnung des Projekts (als Admin)");

  window.S.mitarbeiter.push({ id: "uebWorker", name: "Übersicht Arbeiter", position: "Maler", rolle: "Mitarbeiter", tel: "", email: "uebworker@example.com", adresse: "", eintritt: "2024-01-01", status: "aktiv", urlaubstageJahr: 30, stundenlohn: 20, dokumente: [] });
  window.S.currentUserId = "uebWorker";
  window.document.getElementById("view").innerHTML = "";
  window.renderProjekte(window.document.getElementById("view"), "p1", "uebersicht");
  uebHtml = window.document.getElementById("view").innerHTML;
  assert(uebHtml.includes("Fenster bestellen"), "Übersicht zeigt Aufgaben weiterhin für normale Mitarbeiter");
  assert(!uebHtml.includes("RE-UEB-0001"), "Übersicht blendet Rechnungen für normale Mitarbeiter aus");
  window.S.currentUserId = "m1";

  window.S.aufgaben = window.S.aufgaben.filter((a) => a.id !== "ag-ueb1");
  window.S.rechnungen = window.S.rechnungen.filter((r) => r.id !== "re-ueb1");
  window.S.mitarbeiter = window.S.mitarbeiter.filter((m) => m.id !== "uebWorker");

  console.log("\n== Briefkopf Live-Vorschau (Split-Layout) ==");
  window.S.firma.name = "Ma\"ler & <Söhne> GmbH";
  window.S.firma.slogan = "Test-Slogan";
  let briefOk = true, briefMsg = "";
  try { window.document.getElementById("view").innerHTML = ""; window.renderEinstellungen(window.document.getElementById("view"), "firma"); }
  catch (e) { briefOk = false; briefMsg = e.message; }
  assert(briefOk, "Briefkopf & Firma (Live-Vorschau) rendert ohne Exception" + (briefOk ? "" : " (" + briefMsg + ")"));
  const firmaViewHtml = window.document.getElementById("view").innerHTML;
  assert(firmaViewHtml.includes("Live-Vorschau") && firmaViewHtml.includes("Konfigurieren"), "Split-Layout Konfigurieren/Live-Vorschau vorhanden");
  assert(firmaViewHtml.includes("&lt;Söhne&gt;"), "Firmenname in Live-Vorschau korrekt escaped (kein Tag-Ausbruch)");

  console.log("\n== PDF-Export-Buttons (Stundenzettel, Urlaub, Bautagebuch, Schlüssel, Personalakte) ==");
  window.document.getElementById("view").innerHTML = "";
  window.renderStundenzettel(window.document.getElementById("view"));
  assert(window.document.getElementById("view").innerHTML.includes("exportStundenzettelPDF"), "Stundenzettel hat PDF-Export-Button");
  window.S.urlaubsantraege.push({ id: "ua1", mitarbeiterId: "m1", von: "2026-08-03", bis: "2026-08-07", tage: 5, status: "offen", kommentar: "" });
  window.document.getElementById("view").innerHTML = "";
  window.renderUrlaub(window.document.getElementById("view"));
  assert(window.document.getElementById("view").innerHTML.includes("exportUrlaubUebersichtPDF"), "Urlaub-Übersicht hat PDF-Export-Button");
  assert(window.document.getElementById("view").innerHTML.includes("exportUrlaubantragPDF"), "Urlaubsantrag-Zeilen haben PDF-Export-Button");
  window.document.getElementById("view").innerHTML = "";
  window.renderProjekte(window.document.getElementById("view"), "p1", "bautagebuch");
  assert(window.document.getElementById("view").innerHTML.includes("exportBautagebuchPDF"), "Bautagebuch hat PDF-Export-Button");
  window.document.getElementById("view").innerHTML = "";
  window.renderSchluessel(window.document.getElementById("view"));
  assert(window.document.getElementById("view").innerHTML.includes("exportSchluesselPDF"), "Schlüsselprotokoll hat PDF-Export-Button");
  window._pkTab = "stammdaten";
  window.openPersonalakte("m1");
  const pkModalHtml = window.document.getElementById("modalOverlay").innerHTML;
  assert(pkModalHtml.includes("exportPersonalakteStammblattPDF"), "Personalakte-Stammdaten hat Stammblatt-PDF-Button");
  window.closeModal();
  assert(typeof window.FIRMA_LOGO_DEFAULT === "string" && window.FIRMA_LOGO_DEFAULT.startsWith("data:image/jpeg;base64,"), "Echtes Firmenlogo ist als Default eingebettet");
  assert(window.S.firma.logo === window.FIRMA_LOGO_DEFAULT, "Firmenlogo ist im Default-State gesetzt");
  assert(typeof window.FIRMA_ICON_DEFAULT === "string" && window.FIRMA_ICON_DEFAULT.startsWith("data:image/png;base64,"), "Quadratisches App-Icon ist als Default eingebettet");
  assert(window.S.firma.icon === window.FIRMA_ICON_DEFAULT, "App-Icon ist im Default-State gesetzt");

  console.log("\n== Unterschriftsfelder (Urlaub, Aufmaß, Bautagebuch, Schlüssel, Checkliste) ==");
  let sigOk = true, sigMsg = "";
  try { window.openUrlaubForm(); } catch (e) { sigOk = false; sigMsg = e.message; }
  assert(sigOk, "Urlaubsantrag-Formular mit Unterschriftsfeld rendert ohne Exception" + (sigOk ? "" : " (" + sigMsg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("uSig"), "Urlaubsantrag-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  console.log("\n== Urlaubsantrag: Arbeitgeber kann digital genehmigen & unterschreiben ==");
  let ugOk = true, ugMsg = "";
  try { window.openUrlaubGenehmigenForm("ua1"); } catch (e) { ugOk = false; ugMsg = e.message; }
  assert(ugOk, "Genehmigen-Formular rendert ohne Exception" + (ugOk ? "" : " (" + ugMsg + ")"));
  const ugModalHtml = window.document.getElementById("modalOverlay").innerHTML;
  assert(ugModalHtml.includes("uaSig") && ugModalHtml.includes("Unterschrift Arbeitgeber"), "Genehmigen-Formular enthält Arbeitgeber-Unterschrift-Canvas");
  window.confirmUrlaubGenehmigen("ua1");
  let ua1AfterEmptySig = window.S.urlaubsantraege.find((u) => u.id === "ua1");
  assert(ua1AfterEmptySig.status === "offen", "Ohne Unterschrift bleibt der Antrag 'offen' (Genehmigung wird verweigert)");
  window._urlaubGenehmigenSig = "data:image/png;base64,AAAA";
  window.confirmUrlaubGenehmigen("ua1");
  const ua1 = window.S.urlaubsantraege.find((u) => u.id === "ua1");
  assert(ua1.status === "genehmigt", "Antrag ist nach Unterschrift genehmigt");
  assert(ua1.unterschriftArbeitgeber === "data:image/png;base64,AAAA", "Arbeitgeber-Unterschrift wird am Antrag gespeichert");
  window.document.getElementById("view").innerHTML = "";
  window.renderUrlaub(window.document.getElementById("view"));
  assert(window.document.getElementById("view").innerHTML.includes("✍️ signiert"), "Liste zeigt 'signiert'-Hinweis bei digital unterschriebenem Antrag");

  console.log("\n== Regression: Mic-Button darf nicht als Text im Textarea landen ==");
  // Frueherer Bug: `<textarea id="x">${fieldMic("x")}</textarea>` setzt den Mic-Button-HTML-String
  // als Textarea-INHALT statt als Sibling-Element daneben zu rendern.
  const textareaFormRenderers = [
    ["Urlaubsantrag", () => window.openUrlaubForm()],
    ["Bautagebuch", () => window.openBautagebuchForm("p1")],
    ["Schluessel-Ausgabe", () => window.openSchluesselForm()],
  ];
  textareaFormRenderers.forEach(([name, render]) => {
    render();
    const textareas = Array.from(window.document.querySelectorAll("#modalOverlay textarea"));
    const broken = textareas.some((t) => t.value.includes("micBtn") || t.textContent.includes("micBtn"));
    assert(!broken, name + ": kein Mic-Button-HTML als Textarea-Inhalt gerendert");
    window.closeModal();
  });

  window.document.getElementById("view").innerHTML = "";
  window.renderProjekte(window.document.getElementById("view"), "p1", "aufmass");
  const aufmassHtml = window.document.getElementById("view").innerHTML;
  assert(aufmassHtml.includes("aufmassSig") && aufmassHtml.includes("saveAufmassUnterschrift"), "Aufmaß-Tab hat Unterschriftsfeld für Bestätigung");

  sigOk = true;
  try { window.openBautagebuchForm("p1"); } catch (e) { sigOk = false; sigMsg = e.message; }
  assert(sigOk, "Bautagebuch-Formular mit Unterschriftsfeld rendert ohne Exception" + (sigOk ? "" : " (" + sigMsg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("btSig"), "Bautagebuch-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  sigOk = true;
  try { window.openSchluesselForm(); } catch (e) { sigOk = false; sigMsg = e.message; }
  assert(sigOk, "Schlüssel-Ausgabe-Formular mit Unterschriftsfeld rendert ohne Exception" + (sigOk ? "" : " (" + sigMsg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("skSig"), "Schlüssel-Ausgabe-Formular enthält Unterschrift-Canvas");
  window.closeModal();
  window.S.schluessel.push({ id: "sk1", bezeichnung: "Haustür EG", projektId: "p1", ausgegebenAn: "m1", ausgabeDatum: "2026-07-01", rueckgabeDatum: null, status: "ausgegeben", unterschriftAusgabe: "", unterschriftRueckgabe: "" });
  sigOk = true;
  try { window.openSchluesselRueckgabeForm("sk1"); } catch (e) { sigOk = false; sigMsg = e.message; }
  assert(sigOk, "Schlüssel-Rückgabe-Formular mit Unterschriftsfeld rendert ohne Exception" + (sigOk ? "" : " (" + sigMsg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("skRueckgabeSig"), "Schlüssel-Rückgabe-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  window.document.getElementById("view").innerHTML = "";
  window.renderProjekte(window.document.getElementById("view"), "p1", "checkliste");
  const checklisteHtml = window.document.getElementById("view").innerHTML;
  assert(checklisteHtml.includes("clSig") && checklisteHtml.includes("exportChecklistePDF"), "Checkliste-Tab hat Unterschriftsfeld und PDF-Export");

  console.log("\n== Unterschriftsfelder Runde 2 (Personalakte, Kunde, Subunternehmer, Onboarding, Fuhrpark, Rechnung) ==");
  let sig2Ok = true, sig2Msg = "";
  try { window._pkTab = "stammdaten"; window.openPersonalakte("m1"); } catch (e) { sig2Ok = false; sig2Msg = e.message; }
  assert(sig2Ok, "Personalakte-Stammdaten rendert ohne Exception" + (sig2Ok ? "" : " (" + sig2Msg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("mSig"), "Personalakte-Stammdaten enthält Unterschrift-Canvas");
  window.closeModal();

  sig2Ok = true;
  try { window.openKundeForm(); } catch (e) { sig2Ok = false; sig2Msg = e.message; }
  assert(sig2Ok, "Kunde-anlegen-Formular rendert ohne Exception" + (sig2Ok ? "" : " (" + sig2Msg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("kSig"), "Kunde-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  sig2Ok = true;
  try { window.openSubForm(); } catch (e) { sig2Ok = false; sig2Msg = e.message; }
  assert(sig2Ok, "Subunternehmer-anlegen-Formular rendert ohne Exception" + (sig2Ok ? "" : " (" + sig2Msg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("sSig"), "Subunternehmer-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  window.S.onboardingVorlagen = [{ id: "ov1", name: "Standard", items: ["Punkt A", "Punkt B"] }];
  window.S.onboarding.push({ id: "ob1", mitarbeiterId: "m1", betreuer: "Chef", start: "2026-07-01", items: [{ text: "Punkt A", done: true }, { text: "Punkt B", done: false }], abgeschlossen: null });
  sig2Ok = true;
  try { window.openOnboardingAbschliessenForm("ob1"); } catch (e) { sig2Ok = false; sig2Msg = e.message; }
  assert(sig2Ok, "Onboarding-Abschließen-Formular rendert ohne Exception" + (sig2Ok ? "" : " (" + sig2Msg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("onboardingSig"), "Onboarding-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  sig2Ok = true;
  try { window.openFahrzeugForm(); } catch (e) { sig2Ok = false; sig2Msg = e.message; }
  assert(sig2Ok, "Fahrzeug-anlegen-Formular rendert ohne Exception" + (sig2Ok ? "" : " (" + sig2Msg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("fzSig"), "Fahrzeug-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  window.S.kunden.push({ id: "kd2", name: "Rechnungskunde GmbH", ansprechpartner: "", tel: "", email: "", adresse: "", notizen: "", dokumente: [] });
  sig2Ok = true;
  try { window.openRechnungForm(); } catch (e) { sig2Ok = false; sig2Msg = e.message; }
  assert(sig2Ok, "Rechnung-anlegen-Formular rendert ohne Exception" + (sig2Ok ? "" : " (" + sig2Msg + ")"));
  assert(window.document.getElementById("modalOverlay").innerHTML.includes("rSig"), "Rechnungs-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  console.log("\n== Vorlagen-Katalog (11 Kategorien-Vorlagen, Checkbox-Felder, PDF) ==");
  assert(window.VORLAGEN_DEFS.length === 11, "Vorlagen-Katalog enthält 11 Vorlagen (" + window.VORLAGEN_DEFS.length + ")");
  window.document.getElementById("view").innerHTML = "";
  window.renderVorlagen(window.document.getElementById("view"));
  const vorlagenHtml = window.document.getElementById("view").innerHTML;
  window.VORLAGEN_DEFS.forEach((d) => {
    assert(vorlagenHtml.includes(window.escHtml(d.name)), "Vorlagen-Übersicht zeigt Karte für '" + d.name + "'");
  });
  const uebergabeDef = window.VORLAGEN_DEFS.find((d) => d.id === "uebergabe_mietobjekt");
  let voOk = true, voMsg = "";
  try { window.openVorlageForm("uebergabe_mietobjekt"); } catch (e) { voOk = false; voMsg = e.message; }
  assert(voOk, "Übergabeprotokoll-Vorlage rendert ohne Exception" + (voOk ? "" : " (" + voMsg + ")"));
  const voModalHtml = window.document.getElementById("modalOverlay").innerHTML;
  const checkboxCount = (voModalHtml.match(/type="checkbox"/g) || []).length;
  assert(checkboxCount === uebergabeDef.felder.filter((f) => f.typ === "checkbox").length, "Checkbox-Felder werden als echte Checkboxen gerendert (" + checkboxCount + ")");
  assert(voModalHtml.includes("voSig"), "Vorlagen-Formular enthält Unterschrift-Canvas");
  window.closeModal();

  window.S.vorlagen.push({ id: "vo1", defId: "uebergabe_mietobjekt", projektId: "", werte: { "Objekt": "Musterhaus", "Schlüssel übergeben": "Ja", "Mängelfrei übergeben": "Nein" }, unterschrift: "", datum: window.todayISO() });
  window.document.getElementById("view").innerHTML = "";
  window.renderVorlagen(window.document.getElementById("view"));
  assert(window.document.getElementById("view").innerHTML.includes("exportVorlagePDF"), "Ausgefüllte Vorlage erscheint mit PDF-Export-Button in der Liste");

  console.log("\n== Kalenderansicht (Urlaub + Plantafel im Monatsraster) ==");
  window.document.getElementById("view").innerHTML = "";
  let calOk = true, calMsg = "";
  try { window.renderKalender(window.document.getElementById("view")); } catch (e) { calOk = false; calMsg = e.message; }
  assert(calOk, "Kalender rendert ohne Exception" + (calOk ? "" : " (" + calMsg + ")"));
  const calHtml = window.document.getElementById("view").innerHTML;
  assert(calHtml.includes("calShiftMonth") && calHtml.includes("calGoToday"), "Kalender hat Monats-Navigation");
  window.S.planung.push({ id: "pl1", mitarbeiterId: "m1", datum: window.todayISO(), projektId: "p1" });
  window.S.urlaubsantraege.push({ id: "ua2", mitarbeiterId: "m1", von: window.todayISO(), bis: window.todayISO(), tage: 1, status: "genehmigt", kommentar: "" });
  window.document.getElementById("view").innerHTML = "";
  window.renderKalender(window.document.getElementById("view"));
  assert(window.document.getElementById("view").innerHTML.includes("openKalenderTag"), "Kalendertage sind klickbar (Tagesdetail-Modal)");
  let dayOk = true, dayMsg = "";
  try { window.openKalenderTag(window.todayISO()); } catch (e) { dayOk = false; dayMsg = e.message; }
  assert(dayOk, "Tagesdetail-Modal rendert ohne Exception" + (dayOk ? "" : " (" + dayMsg + ")"));
  const dayHtml = window.document.getElementById("modalOverlay").innerHTML;
  assert(dayHtml.includes("Max Mustermann"), "Tagesdetail zeigt eingeplanten Mitarbeiter (Urlaub und/oder Einsatz)");
  window.closeModal();

  console.log("\n== Foto-Markierung (Freihand-Zeichnen auf Projektfotos) ==");
  window.S.projekte.find((p) => p.id === "p1").fotos.push({ id: "foto1", dataURL: "data:image/jpeg;base64,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", markiert: false, datum: new Date().toISOString() });
  let fotoOk = true, fotoMsg = "";
  try { window.openFotoMarkierung("p1", "foto1"); } catch (e) { fotoOk = false; fotoMsg = e.message; }
  assert(fotoOk, "Foto-Markierung öffnet ohne Exception" + (fotoOk ? "" : " (" + fotoMsg + ")"));
  const fotoModalHtml = window.document.getElementById("modalOverlay").innerHTML;
  assert(fotoModalHtml.includes("fotoMarkCanvas"), "Foto-Markierung zeigt Zeichen-Canvas");
  assert(fotoModalHtml.includes("data-color-swatch"), "Foto-Markierung zeigt Farbauswahl");
  window.closeModal();

  console.log("\n== Pflichtdokumente: Ablaufdatum (Gültig bis) ==");
  assert(window.pflichtDocStatus(null) === "missing", "Kein Dokument -> Status 'missing'");
  assert(window.pflichtDocStatus({ gueltigBis: "" }) === "ok", "Dokument ohne Ablaufdatum -> Status 'ok'");
  const inFarFuture = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
  const inTenDays = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const inPast = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  assert(window.pflichtDocStatus({ gueltigBis: inFarFuture }) === "ok", "Ablaufdatum weit in der Zukunft -> 'ok'");
  assert(window.pflichtDocStatus({ gueltigBis: inTenDays }) === "expiring", "Ablaufdatum in 10 Tagen -> 'expiring'");
  assert(window.pflichtDocStatus({ gueltigBis: inPast }) === "expired", "Ablaufdatum in der Vergangenheit -> 'expired'");

  const mA = window.S.mitarbeiter.find((x) => x.id === "m1");
  mA.dokumente.push({ id: "pd1", name: "ausweis.pdf", dataURL: "data:application/pdf;base64,AAAA", pflichttyp: "Personalausweis / Reisepass", gueltigBis: inTenDays, datum: new Date().toISOString() });
  const checklistHtmlExp = window.renderPflichtChecklist("mitarbeiter", "m1");
  assert(checklistHtmlExp.includes("Läuft bald ab"), "Checkliste zeigt 'Läuft bald ab'-Warnung für Dokument mit nahem Ablaufdatum");
  assert(checklistHtmlExp.includes('type="date"'), "Checkliste bietet 'Gültig bis'-Datumsfeld pro Dokument");

  const warnungen = window.pflichtAlleAblaufwarnungen();
  assert(warnungen.some((w) => w.entityId === "m1" && w.status === "expiring"), "pflichtAlleAblaufwarnungen() erfasst das bald ablaufende Mitarbeiter-Dokument");

  window.document.getElementById("view").innerHTML = "";
  window.renderDashboard(window.document.getElementById("view"));
  assert(window.document.getElementById("view").innerHTML.includes("Pflichtdokumente"), "Dashboard zeigt Pflichtdokumente-Warnkachel");

  console.log("\n== Logo-Verzerrung im PDF-Briefkopf behoben ==");
  {
    const calls = [];
    const textCalls = [];
    const fakeDoc = {
      addImage: (...args) => calls.push(args),
      setFontSize: () => {}, setTextColor: () => {}, setDrawColor: () => {}, line: () => {}, setFont: () => {},
      text: (str) => textCalls.push(str),
    };
    window.S.firma.logo = "data:image/jpeg;base64,AAAA";
    window.S.firma.logoAspect = 1121 / 158;
    window.pdfHeader(fakeDoc, "Test");
    assert(calls.length === 1, "pdfHeader bettet das Logo genau einmal ein");
    const [, , , , w, h] = calls[0];
    const ratio = w / h;
    assert(Math.abs(ratio - 1121 / 158) < 0.01, "Logo wird mit korrektem Seitenverhältnis eingebettet statt auf ein Quadrat gezwungen (Verhältnis=" + ratio.toFixed(2) + ")");
    assert(!textCalls.includes(window.S.firma.name), "Firmenname wird nicht mehr redundant als Text neben dem Logo geschrieben (steht schon im Logo)");
  }

  console.log("\n== Vorlagen: Speichern hinterlegt echtes PDF im gewählten Projekt ==");
  window.openVorlageForm("maengelruege");
  assert(window.document.getElementById("modalOverlay").innerHTML.includes('id="voProjekt"'), "Vorlagen-Formular bietet eine Projekt-Auswahl an");
  window._vorlageDraft.projektId = "p1";
  let saveOk = true, saveMsg = "";
  try { window.saveVorlageInstanz(); } catch (e) { saveOk = false; saveMsg = e.message; }
  assert(saveOk, "saveVorlageInstanz() wirft keine Exception, auch wenn jsPDF (hier) nicht geladen ist" + (saveOk ? "" : " (" + saveMsg + ")"));
  assert(window.S.vorlagen.some((v) => v.projektId === "p1"), "Ausgefüllte Vorlage wird mit der Projekt-ID gespeichert");

  console.log("\n=================================");
  console.log(passed + " Tests bestanden, " + failures + " fehlgeschlagen.");
  console.log("=================================");
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
