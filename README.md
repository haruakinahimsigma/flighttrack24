# Flight Hunter

A responsive aircraft-collecting game prototype: radar-style map + aircraft inspector + collectible livery cards + hangar inventory.

## Current status: v0.2 live ADS-B prototype

- Live aircraft positions from the adsb.lol ADS-B API, served through the app's `/api/live-aircraft` backend endpoint.
- Airport selector for Haneda, Narita, Kansai, Changi, Heathrow and JFK.
- Selectable live aircraft markers and an inspector for the fields actually available from ADS-B.
- Live refresh every 20 seconds; the server caches provider responses briefly.
- Collectible hangar with gameplay-only rarity/value labels and local browser storage.
- Responsive layout for desktop and mobile screens.

**Data limitations:** ADS-B positions do not guarantee an airline identity, aircraft type, registration, origin or destination. Missing fields are shown as unavailable rather than invented. If the live endpoint fails, the map shows no simulated aircraft.

**Data source and license:** Aircraft data is supplied by [adsb.lol](https://adsb.lol), whose public data uses the Open Database License (ODbL) 1.0. Review the [API documentation](https://api.adsb.lol/docs) and its terms before public or production use. This is a personal prototype, not affiliated with adsb.lol or Flightradar24.

## Run locally

Requires Node.js 18+.

```sh
npm start
```

Then open http://localhost:3000.

## Deploy to Railway

Create a Railway project from this GitHub repository. Railway will run `npm start` and provide the `PORT` environment variable automatically.

## Next steps

1. Test `/api/live-aircraft?airport=RJTT&radius=50` while the Node server is running.
2. Validate live coverage and provider rate limits before increasing refresh frequency or radius.
3. Add durable accounts/database storage so a hangar follows the user across devices.
4. Improve livery matching and aircraft images using licensed sources.
5. Tune the map and inspector against actual provider fields and coverage.

## Credits

- Map rendering: [Leaflet](https://leafletjs.com/)
- Demo map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright)

This project is not affiliated with Flightradar24.