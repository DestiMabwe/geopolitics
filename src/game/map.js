/**
 * Great-circle (haversine) distance between two capitals, in km. Earth radius 6371 km.
 * GAME_RULES §3.7.1
 * @param {{ lat: number, lng: number }} a degrees
 * @param {{ lat: number, lng: number }} b degrees
 * @returns {number}
 */

export function distanceKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    if (lat1 === lat2 && a.lng === b.lng) return 0;
    const dLat = lat2 - lat1;
    const dLng = toRad(b.lng - a.lng);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const aVal = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    return 6371 * c;
}

// GAME_RULES §3.7.2–3.7.3: each country's k nearest, made symmetric.
function nearestNeighbours(countries, k = 3) {
    const borders = {};

    // §3.7.2: k nearest, distance ties → lower code
    for (const country of countries) {
        const distances = countries
            .filter((c) => c.code !== country.code)
            .map((c) => ({ code: c.code, distance: distanceKm(country, c) }))
            .sort((a, b) => a.distance - b.distance || a.code.localeCompare(b.code));
        borders[country.code] = distances.slice(0, k).map((d) => d.code);
    }

    // §3.7.3: if A lists B, B lists A
    for (const [a, list] of Object.entries(borders)) {
        for (const b of list) {
            if (!borders[b].includes(a)) {
                borders[b].push(a);
            }
        }
    }

    return borders;
}

// Splits the map into groups of countries that can reach each other (flood fill).
function findGroups(borders) {
    const seen = new Set();
    const groups = [];
    for (const start of Object.keys(borders)) {
        if (seen.has(start)) continue;
        const group = [start];
        seen.add(start);
        const queue = [start];
        while (queue.length) {
            for (const next of borders[queue.shift()]) {
                if (!seen.has(next)) {
                    seen.add(next);
                    group.push(next);
                    queue.push(next);
                }
            }
        }
        groups.push(group);
    }
    return groups;
}

// GAME_RULES §3.7.4: add the shortest link between two different groups until connected,
// ties → alphabetically first pair of codes.
function connect(countries, borders) {
    const byCode = Object.fromEntries(countries.map((c) => [c.code, c]));
    while (true) {
        const groups = findGroups(borders);
        if (groups.length === 1) break;

        const groupOf = {};
        groups.forEach((group, i) => group.forEach((code) => (groupOf[code] = i)));

        let best = null;
        const codes = Object.keys(borders).sort();
        for (let i = 0; i < codes.length; i++) {
            for (let j = i + 1; j < codes.length; j++) {
                const a = codes[i];
                const b = codes[j];
                if (groupOf[a] === groupOf[b]) continue;
                const distance = distanceKm(byCode[a], byCode[b]);
                // codes are sorted, so the first pair found at a given distance is the
                // alphabetically first one; only a strictly shorter link replaces it
                if (!best || distance < best.distance) best = { a, b, distance };
            }
        }
        borders[best.a].push(best.b);
        borders[best.b].push(best.a);
    }
    for (const code of Object.keys(borders)) borders[code].sort();
    return borders;
}

/**
 * The game map. Each country borders its k nearest others (distance ties → lower code),
 * every link is made symmetric, then the shortest link between two different groups is
 * added until the map is connected (ties → alphabetically first pair of codes).
 * Each neighbour list is sorted by code. Does not mutate `countries`.
 * GAME_RULES §3.7
 * @param {{ code: string, lat: number, lng: number }[]} countries
 * @param {number} [k=3]
 * @returns {Record<string, string[]>} code → neighbour codes
 */
export function buildBorders(countries, k = 3) {
    return connect(countries, nearestNeighbours(countries, k));
}

/**
 * Whether countries `a` and `b` border each other on this game's map (`state.borders`).
 * Unknown codes are not neighbours. Does not mutate `state`.
 * GAME_RULES §3.7, §5.1
 * @param {{ borders: Record<string, string[]> }} state
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function isNeighbour(state, a, b) {
    return (state.borders[a]?.includes(b) ?? false) && (state.borders[b]?.includes(a) ?? false);
}
