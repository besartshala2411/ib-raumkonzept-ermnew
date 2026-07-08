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

  // wait for DOMContentLoaded-driven boot() to finish (it's async)
  await new Promise((resolve) => {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const grid = window.document.getElementById("userPickGrid");
      if ((grid && grid.innerHTML.includes("Noch keine")) || tries > 100) { clearInterval(iv); resolve(); }
    }, 50);
  });

  console.log("\n== Boot & Login ==");
  assert(!!window.document.getElementById("loginScreen"), "Login-Screen vorhanden");
  assert(window.MODULES && window.MODULES.length >= 20, "Alle Module registriert (" + (window.MODULES ? window.MODULES.length : 0) + ")");
  assert(typeof window.S === "object", "State S initialisiert");

  window.loginAsGast();
  assert(window.document.getElementById("appShell").classList.contains("hidden") === false, "App-Shell nach Login sichtbar");

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
  window.S.mitarbeiter.push({ id: "m1", name: "Max Mustermann", position: "Vorarbeiter", tel: "", email: "", adresse: "", eintritt: "2024-01-01", status: "aktiv", urlaubstageJahr: 30, stundenlohn: 20, dokumente: [] });
  assert(window.S.mitarbeiter.length === 1, "Mitarbeiter hinzugefügt");
  window.route("#mitarbeiter");
  assert(window.document.getElementById("view").innerHTML.includes("Max Mustermann"), "Mitarbeiter erscheint in Liste");

  console.log("\n== Stempeluhr ==");
  window.stempelKommen("m1");
  assert(window.S.zeiterfassung.length === 1 && window.S.zeiterfassung[0].gehen === null, "Kommen gebucht");
  window.stempelGehen("m1");
  assert(window.S.zeiterfassung[0].gehen !== null, "Gehen gebucht");

  console.log("\n== Projekte & Aufmaß (Shoelace-Formel) ==");
  window.S.projekte.push({ id: "p1", name: "Testprojekt", kundeId: "", adresse: "", status: "Aktiv", budget: 1000, deadline: "", fortschritt: 10, team: [], fotos: [], dokumente: [], material: [], bautagebuch: [], zugaenge: [], checkliste: [], aufmasse: [], chat: [] });
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

  console.log("\n== Projekt <-> Subunternehmer Zuordnung ==");
  window.addSubToProjekt("sub1", "p1");
  assert(window.S.projekte.find((p) => p.id === "p1").subunternehmer.includes("sub1"), "Subunternehmer wird dem Projekt zugeordnet");
  window.removeSubFromProjekt("sub1", "p1");
  assert(!window.S.projekte.find((p) => p.id === "p1").subunternehmer.includes("sub1"), "Subunternehmer-Zuordnung wird wieder entfernt");

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

  console.log("\n=================================");
  console.log(passed + " Tests bestanden, " + failures + " fehlgeschlagen.");
  console.log("=================================");
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
