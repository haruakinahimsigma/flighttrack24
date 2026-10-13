# Flight Hunter

A responsive aircraft-collecting game prototype: radar-style map + aircraft inspector + collectible livery cards + hangar inventory.

## Current status: v0.1 demo

- Interactive Leaflet map with selectable sample aircraft.
- Aircraft inspector with callsign, airline, type, registration, route, altitude, speed, heading and vertical speed.
- Collect button and duplicate tracking by airline + aircraft type + livery.
- Hangar cards, rarity labels, estimated in-game value, search and sorting.
- Collection stored locally in the current browser using localStorage.
- Responsive layout for desktop and mobile screens.

**The aircraft in this version are illustrative demo records, not live aircraft.** Positions and details are not verified, and values/rarities are game examples. No live flight-data provider is connected yet.

## Run locally

Requires Node.js 18+.

```sh
npm start
```

Then open http://localhost:3000.

## Deploy to Railway

Create a Railway project from this GitHub repository. Railway will run `npm start` and provide the `PORT` environment variable automatically.

## Next steps

1. Choose a flight-data provider whose license permits this game's intended use.
2. Replace demo records with the provider's live aircraft data.
3. Add durable accounts/database storage so a hangar follows the user across devices.
4. Improve livery matching and aircraft images using licensed sources.
5. Tune the map and inspector against the chosen provider's actual fields and coverage.

## Credits

- Map rendering: [Leaflet](https://leafletjs.com/)
- Demo map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright)

This project is not affiliated with Flightradar24.