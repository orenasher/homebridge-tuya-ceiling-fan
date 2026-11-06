'use strict';

// Pure value conversions between HomeKit and Tuya. No Homebridge or network code here,
// so everything in this file is covered by unit tests.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const toInt = (value, fallback = 0) => {
    const v = parseInt(value, 10);
    return Number.isNaN(v) ? fallback : v;
};

// ---- Fan speed: levels 0..maxSpeed (0 = off) -------------------------------------------

// opts.values:  explicit list of the device's speed values, slowest first (level i -> values[i-1]).
// opts.percent: the device wants a 1..100 percent value; levels are spread over it.
function speedFromTuya(value, maxSpeed, opts = {}) {
    if (Array.isArray(opts.values) && opts.values.length) {
        const i = opts.values.findIndex(x => String(x) === String(value));
        return i === -1 ? 0 : i + 1;
    }
    if (opts.percent) {
        const pct = clamp(toInt(value), 0, 100);
        return pct === 0 ? 0 : clamp(Math.round((pct * maxSpeed) / 100), 1, maxSpeed);
    }
    return clamp(toInt(value), 0, maxSpeed);
}

function speedToTuya(level, maxSpeed, asString, opts = {}) {
    const v = clamp(toInt(level), 1, maxSpeed);
    if (Array.isArray(opts.values) && opts.values.length) return opts.values[v - 1];
    if (opts.percent) {
        const pct = clamp(Math.round((v * 100) / maxSpeed), 1, 100);
        return asString ? String(pct) : pct;
    }
    return asString ? String(v) : v;
}

// ---- Light brightness: HomeKit 0..100 %, Tuya 10..1000 ----------------------------------

const BRIGHT_MIN = 10;
const BRIGHT_MAX = 1000;

function brightnessFromTuya(value, min = BRIGHT_MIN, max = BRIGHT_MAX) {
    const v = clamp(toInt(value), 0, max);
    return clamp(Math.round(((v - min) * 100) / (max - min)), 0, 100);
}

function brightnessToTuya(percent, min = BRIGHT_MIN, max = BRIGHT_MAX, asString = false) {
    const p = clamp(toInt(percent), 0, 100);
    const v = clamp(Math.round(min + (p * (max - min)) / 100), min, max);
    return asString ? String(v) : v;
}

// ---- Colour temperature: HomeKit mireds, Tuya 0 (warm) .. 1000 (cool) -------------------

const TEMP_SCALE = 1000;

function colorTempFromTuya(value, minMired, maxMired, scale = TEMP_SCALE) {
    const v = clamp(toInt(value), 0, scale);
    return clamp(Math.round(maxMired - (v * (maxMired - minMired)) / scale), minMired, maxMired);
}

function colorTempToTuya(mired, minMired, maxMired, asString = false, scale = TEMP_SCALE) {
    const m = clamp(toInt(mired, minMired), minMired, maxMired);
    const v = clamp(Math.round(((maxMired - m) * scale) / (maxMired - minMired)), 0, scale);
    return asString ? String(v) : v;
}

// ---- Discrete light modes (e.g. warm / neutral / cool) ------------------------------------
// The device only knows N named or numbered modes. They are spread evenly over the mired
// range, warmest first, so Apple Home's colour presets land on real modes.

function modeMired(index, count, minMired, maxMired) {
    if (count <= 1) return maxMired;
    return Math.round(maxMired - (index * (maxMired - minMired)) / (count - 1));
}

function modeIndexFromTuya(value, modes) {
    const i = modes.findIndex(m => String(m) === String(value));
    return i === -1 ? 0 : i;
}

function miredFromMode(value, modes, minMired, maxMired) {
    return modeMired(modeIndexFromTuya(value, modes), modes.length, minMired, maxMired);
}

function modeFromMired(mired, modes, minMired, maxMired) {
    let best = 0;
    let bestDist = Infinity;
    modes.forEach((_, i) => {
        const d = Math.abs(modeMired(i, modes.length, minMired, maxMired) - mired);
        if (d < bestDist) {
            best = i;
            bestDist = d;
        }
    });
    return modes[best];
}

// Config lists modes as text; send numbers when the device wants numbers.
function normalizeModes(list, asString) {
    if (!Array.isArray(list)) return [];
    return list
        .map(m => String(m).trim())
        .filter(m => m.length)
        .map(m => (!asString && /^-?\d+$/.test(m) ? parseInt(m, 10) : m));
}

module.exports = {
    clamp,
    toInt,
    speedFromTuya,
    speedToTuya,
    brightnessFromTuya,
    brightnessToTuya,
    colorTempFromTuya,
    colorTempToTuya,
    modeMired,
    modeIndexFromTuya,
    miredFromMode,
    modeFromMired,
    normalizeModes,
};
