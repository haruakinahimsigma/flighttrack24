const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

const airports = {
  RJTT: { name: "Tokyo Haneda", lat: 35.5494, lon: 139.7798 },
  RJAA: { name: "Tokyo Narita", lat: 35.7720, lon: 140.3929 },
  RJBB: { name: "Osaka Kansai", lat: 34.4347, lon: 135.2440 },
  WSSS: { name: "Singapore Changi", lat: 1.3644, lon: 103.9915 },
  EGLL: { name: "London Heathrow", lat: 51.4700, lon: -0.4543 },
  KJFK: { name: "New York JFK", lat: 40.6413, lon: -73.7781 },
};
let liveCache = new Map();

async function liveAircraft(url, res) {
  const airportCode = (url.searchParams.get("airport") || "RJTT").toUpperCase();
  const airport = airports[airportCode];
  if (!airport) {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "Unsupported airport code." }));
  }
  const radius = Math.max(10, Math.min(100, Number(url.searchParams.get("radius")) || 50));
  const cacheKey = airportCode + ":" + radius;
  const cached = liveCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 12000) {
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
    res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Live aircraft data is temporarily unavailable.", detail: error.message, source: "adsb.lol" }));
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/live-aircraft") return void liveAircraft(url, res);
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
