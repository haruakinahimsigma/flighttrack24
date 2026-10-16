const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

const airports = {
  RJTT: { code: "RJTT", name: "Tokyo International Airport (Haneda Airport)", lat: 35.5494, lon: 139.7798, iata: "HND", icao: "RJTT", country: "Japan" },
  RJAA: { code: "RJAA", name: "Narita International Airport", lat: 35.7720, lon: 140.3929, iata: "NRT", icao: "RJAA", country: "Japan" },
  RJBB: { code: "RJBB", name: "Kansai International Airport", lat: 34.4347, lon: 135.2440, iata: "KIX", icao: "RJBB", country: "Japan" },
  WSSS: { code: "WSSS", name: "Singapore Changi Airport", lat: 1.3644, lon: 103.9915, iata: "SIN", icao: "WSSS", country: "Singapore" },
  EGLL: { code: "EGLL", name: "London Heathrow Airport", lat: 51.4700, lon: -0.4543, iata: "LHR", icao: "EGLL", country: "United Kingdom" },
  KJFK: { code: "KJFK", name: "John F. Kennedy International Airport", lat: 40.6413, lon: -73.7781, iata: "JFK", icao: "KJFK", country: "United States" },
};
let airportDatabase = null;
let airportDatabaseLoadedAt = 0;
let airportDatabasePromise = null;
async function getAirportDatabase() {
  if (airportDatabase && Date.now() - airportDatabaseLoadedAt < 24 * 60 * 60 * 1000) return airportDatabase;
  if (airportDatabasePromise) return airportDatabasePromise;
  airportDatabasePromise = (async () => {
    try {
      const response = await fetch("https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv", {
        headers: { "accept": "text/csv", "user-agent": "FlightHunter/0.4 (airport search)" },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error("Airport database returned HTTP " + response.status);
      const csv = await response.text();
      const lines = csv.split(/\r?\n/);
      const headers = parseCsvLine(lines.shift() || "");
      const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
      const rows = [];
      for (const line of lines) {
        if (!line) continue;
        const c = parseCsvLine(line);
        const lat = Number(c[idx.latitude_deg]), lon = Number(c[idx.longitude_deg]);
        const name = c[idx.name] || "";
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const icao = c[idx.icao_code] || c[idx.gps_code] || "";
        const iata = c[idx.iata_code] || "";
        const ident = c[idx.ident] || "";
        const code = icao || iata || ident;
        if (!code) continue;
        rows.push({
          code, ident, icao, iata, name, lat, lon,
          city: c[idx.municipality] || "",
          country: c[idx.iso_country] || "",
          type: c[idx.type] || "airport"
        });
      }
      airportDatabase = rows;
      airportDatabaseLoadedAt = Date.now();
      return rows;
    } catch (error) {
      console.warn("Global airport database unavailable:", error.message);
      return Object.values(airports);
    } finally {
      airportDatabasePromise = null;
    }
  })();
  return airportDatabasePromise;
}
function parseCsvLine(line) {
  const out = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(value); value = "";
    } else value += ch;
  }
  out.push(value);
  return out;
}
async function searchAirports(url, res) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 100);
  if (q.length < 2) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify({ airports: [] }));
  }
  const rows = await getAirportDatabase();
  const matched = rows.map(a => ({
    ...a,
    label: [a.name, a.city, a.country].filter(Boolean).join(" · ")
  })).filter(a => (
    a.name.toLowerCase().includes(q) ||
    (a.city || "").toLowerCase().includes(q) ||
    (a.country || "").toLowerCase().includes(q) ||
    (a.iata || "").toLowerCase() === q ||
    (a.icao || "").toLowerCase() === q ||
    (a.ident || "").toLowerCase() === q ||
    (a.code || "").toLowerCase() === q
  )).sort((a, b) => {
    const score = a => (a.name.toLowerCase().startsWith(q) ? 0 : (a.iata || "").toLowerCase() === q || (a.icao || "").toLowerCase() === q || (a.ident || "").toLowerCase() === q ? 1 : (a.city || "").toLowerCase().startsWith(q) ? 2 : 3);
    return score(a) - score(b) || a.name.localeCompare(b.name);
  }).slice(0, 30);
  res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify({ airports: matched, count: rows.length, source: "OurAirports" }));
}
let liveCache = new Map();
const infoCache = new Map();

async function aircraftInfo(url, res) {
  const callsign = String(url.searchParams.get("callsign") || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
  const hex = String(url.searchParams.get("hex") || "").trim().toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 6);
  const reg = String(url.searchParams.get("reg") || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
  const key = [callsign, hex, reg].join(":");
  const cached = infoCache.get(key);
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify(cached.data));
  }
  const airline = String(url.searchParams.get("airline") || "").trim().slice(0, 80);
  const aircraftType = String(url.searchParams.get("type") || "").trim().slice(0, 80);
  const result = { callsign, route: null, photo: null, photoLink: null, photographer: null, photoSource: null, photoKind: null };
  const jobs = [];
  if (callsign && !/^HEX\s/.test(callsign)) {
    jobs.push((async () => {
      try {
        const r = await fetch("https://api.adsbdb.com/v0/callsign/" + encodeURIComponent(callsign), {
          headers: { "accept": "application/json", "user-agent": "FlightHunter/0.3" },
          signal: AbortSignal.timeout(5000)
        });
        if (!r.ok) return;
        const j = await r.json();
        const f = j?.response?.flightroute || j?.flightroute || j?.response?.route || null;
        const airport = a => a ? {
          icao: a.icao_code || a.icao || "",
          iata: a.iata_code || a.iata || "",
          name: a.name || ""
        } : null;
        if (f && (f.origin || f.destination)) result.route = {
          origin: airport(f.origin),
          destination: airport(f.destination),
          source: "adsbdb"
        };
      } catch (_) {}
    })());
  }
  if (hex || reg) {
    jobs.push((async () => {
      try {
        const endpoint = hex
          ? "https://api.planespotters.net/pub/photos/hex/" + encodeURIComponent(hex) + (reg ? "?reg=" + encodeURIComponent(reg) : "")
          : "https://api.planespotters.net/pub/photos/reg/" + encodeURIComponent(reg);
        const r = await fetch(endpoint, {
          headers: { "accept": "application/json", "user-agent": "FlightHunter/0.3 (aircraft photo lookup)" },
          signal: AbortSignal.timeout(6000)
        });
        if (!r.ok) return;
        const j = await r.json();
        const p = Array.isArray(j.photos) ? j.photos[0] : null;
        if (p) {
          result.photo = p.thumbnail_large?.src || p.thumbnail?.src || p.thumbnail?.url || p.image?.src || null;
          result.photoLink = p.link || null;
          result.photographer = p.photographer || null;
          result.photoSource = "Planespotters.net";
          result.photoKind = "exact";
        }
      } catch (_) {}
    })());
  }
  await Promise.all(jobs);
  if (!result.photo) {
    try {
      const searchTerms = [airline !== "Operator not verified" ? airline : "", aircraftType, "aircraft"].filter(Boolean).join(" ");
      const endpoint = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=" + encodeURIComponent("filetype:bitmap " + searchTerms) + "&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=900&format=json";
      const r = await fetch(endpoint, {
        headers: { "accept": "application/json", "user-agent": "FlightHunter/0.4 (representative aircraft photos)" },
        signal: AbortSignal.timeout(7000)
      });
      if (r.ok) {
        const j = await r.json();
        const pages = Object.values(j?.query?.pages || {});
        const usable = pages.find(p => p.imageinfo?.[0]?.thumburl && /\.(jpe?g|png|webp)/i.test(p.title || ""));
        if (usable) {
          const info = usable.imageinfo[0];
          result.photo = info.thumburl;
          result.photoLink = info.descriptionurl || ("https://commons.wikimedia.org/wiki/" + encodeURIComponent(usable.title.replace(/ /g, "_")));
          const artist = info.extmetadata?.Artist?.value || "";
          result.photographer = artist.replace(/<[^>]*>/g, "").slice(0, 120) || null;
          result.photoSource = "Wikimedia Commons";
          result.photoKind = "representative";
        }
      }
    } catch (_) {}
  }
  infoCache.set(key, { time: Date.now(), data: result });
  if (infoCache.size > 1000) infoCache.delete(infoCache.keys().next().value);
  res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(result));
}

async function findAirport(code) {
  const key = String(code || "").toUpperCase();
  if (airports[key]) return airports[key];
  const rows = await getAirportDatabase();
  return rows.find(a => [a.code, a.ident, a.icao, a.iata, a.gps_code].some(v => v && String(v).toUpperCase() === key)) || null;
}

async function liveAircraft(url, res) {
  const airportCode = (url.searchParams.get("airport") || "RJTT").toUpperCase();
  const airport = await findAirport(airportCode);
  if (!airport) {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "Unsupported airport code." }));
  }
  const radius = Math.max(10, Math.min(100, Number(url.searchParams.get("radius")) || 50));
  const cacheKey = airportCode + ":" + radius;
  const cached = liveCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 3000) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ...cached.data, cached: true }));
  }
  try {
    const endpoint = `https://api.adsb.lol/v2/point/${airport.lat}/${airport.lon}/${radius}`;
    const response = await fetch(endpoint, { headers: { "accept": "application/json", "user-agent": "FlightHunter/0.2 (personal aviation project)" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Live flight provider returned HTTP " + response.status);
    const raw = await response.json();
    const data = {
      airport: airportCode,
      airportName: airport.name,
      source: "adsb.lol",
      license: "Open Database License (ODbL)",
      fetchedAt: new Date().toISOString(),
      total: Number(raw.total ?? raw.ac?.length ?? 0),
      aircraft: Array.isArray(raw.ac) ? raw.ac.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon)) : [],
    };
    liveCache.set(cacheKey, { time: Date.now(), data });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(data));
  } catch (error) {
    // Keep the last successful snapshot available during brief upstream outages.
    const previous = liveCache.get(cacheKey);
    if (previous) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-flight-data-stale": "1" });
      return res.end(JSON.stringify({ ...previous.data, cached: true, stale: true, feedWarning: "Live provider temporarily unreachable; showing last successful positions." }));
    }
    res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Live aircraft data is temporarily unavailable.", detail: error.message, source: "adsb.lol" }));
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/airports") return void searchAirports(url, res);
  if (url.pathname === "/api/live-aircraft") return void liveAircraft(url, res);
  if (url.pathname === "/api/aircraft-info") return void aircraftInfo(url, res);
  const pathname = decodeURIComponent(url.pathname);
  let file = path.join(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Not found");
      }
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "x-content-type-options": "nosniff" });
      res.end(data);
    });
  });
}).listen(port, "0.0.0.0", () => console.log(`Flight Hunter listening on ${port}`));
