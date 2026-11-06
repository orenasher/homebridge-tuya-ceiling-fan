'use strict';

// Tuya Cloud client used ONLY by the setup wizard (homebridge-ui) to look up each fan's
// device ID, local key and data point numbers. The plugin itself never talks to the cloud.
// Nothing here is stored: the Access ID / Secret live in memory while the wizard is open.

const crypto = require('crypto');

const REGIONS = {
    eu: {name: 'Central Europe', url: 'https://openapi.tuyaeu.com'},
    weu: {name: 'Western Europe', url: 'https://openapi-weaz.tuyaeu.com'},
    us: {name: 'Western America', url: 'https://openapi.tuyaus.com'},
    eus: {name: 'Eastern America', url: 'https://openapi-ueaz.tuyaus.com'},
    in: {name: 'India', url: 'https://openapi.tuyain.com'},
    sg: {name: 'Singapore', url: 'https://openapi-sg.iotbing.com'},
    cn: {name: 'China', url: 'https://openapi.tuyacn.com'},
};

class CloudError extends Error {
    constructor(code, msg) {
        super(`Tuya Cloud error ${code}: ${msg}`);
        this.code = code;
        this.msg = msg;
    }
}

const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Tuya OpenAPI request signature (HMAC-SHA256, "new" signing scheme).
function signRequest({clientId, secret, token = '', t, method, path, body = ''}) {
    const stringToSign = [method.toUpperCase(), sha256(body), '', path].join('\n');
    return crypto.createHmac('sha256', secret)
        .update(clientId + token + t + stringToSign, 'utf8')
        .digest('hex')
        .toUpperCase();
}

function buildPath(path, query) {
    if (!query) return path;
    const keys = Object.keys(query).filter(k => query[k] !== undefined && query[k] !== '').sort();
    if (!keys.length) return path;
    return `${path}?${keys.map(k => `${k}=${query[k]}`).join('&')}`;
}

class TuyaCloud {
    constructor({accessId, accessSecret, region = 'auto', fetchImpl, now}) {
        this.accessId = String(accessId || '').trim();
        this.accessSecret = String(accessSecret || '').trim();
        this.region = region;
        this.fetch = fetchImpl || ((...a) => fetch(...a));
        this.now = now || (() => Date.now());
        this.baseUrl = null;
        this.token = null;
    }

    async _call(method, path, {query, body, base, withToken = true} = {}) {
        const fullPath = buildPath(path, query);
        const bodyText = body ? JSON.stringify(body) : '';
        const t = String(this.now());
        const token = withToken && this.token ? this.token : '';
        const headers = {
            client_id: this.accessId,
            sign: signRequest({
                clientId: this.accessId, secret: this.accessSecret, token, t, method, path: fullPath, body: bodyText,
            }),
            t,
            sign_method: 'HMAC-SHA256',
            'Content-Type': 'application/json',
        };
        if (token) headers.access_token = token;
        const res = await this.fetch(`${base || this.baseUrl}${fullPath}`, {
            method, headers, body: bodyText || undefined,
        });
        let json;
        try {
            json = await res.json();
        } catch (e) {
            throw new CloudError('bad_response', 'The Tuya server returned an unreadable answer.');
        }
        if (!json || json.success !== true) {
            throw new CloudError(json && json.code !== undefined ? json.code : 'unknown', (json && json.msg) || 'unknown error');
        }
        return json.result;
    }

    async connect() {
        const keys = this.region && this.region !== 'auto' ? [this.region] : Object.keys(REGIONS);
        const errors = [];
        for (const key of keys) {
            const region = REGIONS[key];
            if (!region) continue;
            try {
                const result = await this._call('GET', '/v1.0/token', {query: {grant_type: 1}, base: region.url, withToken: false});
                this.baseUrl = region.url;
                this.token = result.access_token;
                this.regionKey = key;
                return key;
            } catch (e) {
                errors.push(e);
            }
        }
        // Prefer an error that is not just "wrong region / wrong secret" noise.
        const informative = errors.find(e => e.code !== 1004 && e.code !== 2007 && e.code !== 'bad_response');
        throw informative || errors[0] || new CloudError('unknown', 'No data center to try.');
    }

    // Every device on the linked Smart Life / Tuya Smart account (includes its local key).
    async listDevices() {
        const devices = [];
        let lastRowKey = '';
        for (let page = 0; page < 50; page++) {
            const result = await this._call('GET', '/v1.0/iot-01/associated-users/devices', {
                query: {size: 50, last_row_key: lastRowKey},
            });
            (result.devices || []).forEach(d => devices.push({
                id: d.id,
                name: d.name,
                localKey: d.local_key,
                category: d.category,
                productName: d.product_name,
                online: d.online,
                model: d.model,
            }));
            if (!result.has_more || !result.last_row_key) break;
            lastRowKey = result.last_row_key;
        }
        return devices;
    }

    // Data points of one device: [{dpId, code, type, range, min, max, step}]
    async inspect(id) {
        try {
            const result = await this._call('GET', `/v2.0/cloud/thing/${id}/model`);
            const model = typeof result.model === 'string' ? JSON.parse(result.model) : result.model;
            const props = propsFromModel(model);
            if (props.length) return props;
        } catch (e) {
            // fall through to the older endpoints
        }
        const spec = await this._call('GET', `/v1.0/devices/${id}/specifications`);
        const shadow = await this._call('GET', `/v2.0/cloud/thing/${id}/shadow/properties`);
        return propsFromSpecAndShadow(spec, shadow);
    }
}

// ---- normalising the different answers into one shape -----------------------------------

function normType(t) {
    const x = String(t || '').toLowerCase();
    if (x === 'value' || x === 'integer') return 'integer';
    if (x === 'boolean' || x === 'bool') return 'bool';
    return x;
}

function propsFromModel(model) {
    const out = [];
    ((model && model.services) || []).forEach(service => {
        (service.properties || []).forEach(p => {
            const spec = p.typeSpec || {};
            out.push({
                dpId: Number(p.abilityId),
                code: p.code,
                type: normType(spec.type),
                range: Array.isArray(spec.range) ? spec.range.map(String) : undefined,
                min: spec.min,
                max: spec.max,
                step: spec.step,
            });
        });
    });
    return out;
}

function parseValues(values) {
    if (!values) return {};
    if (typeof values === 'object') return values;
    try {
        return JSON.parse(values);
    } catch (e) {
        return {};
    }
}

function propsFromSpecAndShadow(spec, shadow) {
    const dpByCode = {};
    ((shadow && shadow.properties) || []).forEach(p => {
        if (p.code !== undefined && p.dp_id !== undefined) dpByCode[p.code] = Number(p.dp_id);
    });
    const all = [...((spec && spec.functions) || []), ...((spec && spec.status) || [])];
    const seen = new Set();
    const out = [];
    all.forEach(f => {
        if (seen.has(f.code) || dpByCode[f.code] === undefined) return;
        seen.add(f.code);
        const v = parseValues(f.values);
        out.push({
            dpId: dpByCode[f.code],
            code: f.code,
            type: normType(f.type),
            range: Array.isArray(v.range) ? v.range.map(String) : undefined,
            min: v.min,
            max: v.max,
            step: v.step,
        });
    });
    return out;
}

// ---- turning data points into a plugin device config ---------------------------------------

const FAN_CATEGORIES = ['fs', 'fsd', 'fskg'];

const CODES = {
    fanOn: ['fan_switch', 'switch_fan', 'fan_power', 'fan_switch_1', 'switch_fan_1'],
    lightOn: ['light', 'switch_led', 'switch_light', 'light_switch', 'led_switch', 'switch_led_1', 'lightswitch'],
    speed: ['fan_speed_enum', 'fan_speed', 'fan_level', 'fan_speed_percent', 'speed'],
    direction: ['fan_direction', 'direction'],
    swing: ['switch_horizontal', 'fan_oscillation', 'oscillation', 'swing', 'shake', 'switch_vertical'],
    brightness: ['bright_value', 'bright_value_v2', 'bright_value_1'],
    colorTemp: ['temp_value', 'temp_value_v2', 'temp_value_1'],
};

const pick = (props, list, accept = () => true) => {
    for (const code of list) {
        const p = props.find(x => x.code === code && accept(x));
        if (p) return p;
    }
    return null;
};

const isNumericRange = range => Array.isArray(range) && range.length > 0 && range.every(v => /^\d+$/.test(v));

function mapFan(props) {
    const notes = [];
    const used = new Set();
    const take = p => {
        if (p) used.add(p.code);
        return p;
    };

    const lightOn = take(pick(props, CODES.lightOn, p => p.type === 'bool'));
    let fanOn = take(pick(props, CODES.fanOn, p => p.type === 'bool'));
    if (!fanOn) {
        const sw = props.find(p => p.code === 'switch' && p.type === 'bool');
        if (sw) fanOn = take(sw);
    }
    const speed = take(pick(props, CODES.speed, p => p.type === 'enum') || pick(props, CODES.speed, p => p.type === 'integer'));
    const direction = take(pick(props, CODES.direction, p => p.type === 'enum'));
    const swing = take(pick(props, CODES.swing, p => p.type === 'bool'));
    const brightness = take(pick(props, CODES.brightness, p => p.type === 'integer'));
    const colorTemp = take(pick(props, CODES.colorTemp, p => p.type === 'integer'));

    const config = {};
    if (fanOn) config.dpFanOn = fanOn.dpId;

    if (speed) {
        config.dpFanSpeed = speed.dpId;
        if (speed.type === 'enum') {
            const range = (speed.range || []).filter(v => v.length);
            const consecutive = isNumericRange(range) && range.every((v, i) => Number(v) === i + 1);
            if (consecutive) {
                config.maxSpeed = range.length;
                config.speedAsString = true;
            } else {
                config.speedValues = range;
                config.maxSpeed = range.length;
                config.speedAsString = true;
                notes.push('speedValues');
            }
        } else {
            const max = Number(speed.max);
            if (max > 20) {
                config.speedPercent = true;
                config.speedAsString = false;
                config.maxSpeed = 6;
                notes.push('speedPercent');
            } else {
                config.maxSpeed = max || 6;
                config.speedAsString = false;
            }
        }
    }

    if (direction) {
        config.dpFanDirection = direction.dpId;
        const range = direction.range || [];
        if (range.length >= 2) {
            config.directionForward = range[0];
            config.directionReverse = range[1];
        }
    } else {
        config.useDirection = false;
    }

    if (swing) config.dpSwing = swing.dpId;

    if (lightOn) {
        config.dpLightOn = lightOn.dpId;
        if (brightness) {
            config.dpBrightness = brightness.dpId;
            if (brightness.min !== undefined) config.brightMin = Number(brightness.min);
            if (brightness.max !== undefined) config.brightMax = Number(brightness.max);
        } else {
            config.useBrightness = false;
        }
        if (colorTemp) {
            config.dpColorTemp = colorTemp.dpId;
            if (colorTemp.max !== undefined && Number(colorTemp.max) !== 1000) config.tempMax = Number(colorTemp.max);
        } else {
            config.useColorTemp = false;
        }
    } else {
        config.useLight = false;
    }

    const features = {
        fan: !!fanOn,
        speeds: config.maxSpeed || 0,
        direction: !!direction,
        swing: !!swing,
        light: !!lightOn,
        brightness: !!brightness,
        colorTemp: !!colorTemp,
    };
    const unmapped = props.filter(p => !used.has(p.code)).map(p => `${p.dpId}:${p.code}`);
    return {config, features, notes, unmapped};
}

function isFanLike(device, mapped) {
    if (mapped) return mapped.features.fan || mapped.features.speeds > 0;
    const text = `${device.name || ''} ${device.productName || ''}`;
    return FAN_CATEGORIES.includes(device.category) || /fan|מאוורר|ventilat/i.test(text);
}

module.exports = {
    REGIONS, CloudError, TuyaCloud, signRequest, buildPath,
    propsFromModel, propsFromSpecAndShadow, mapFan, isFanLike, FAN_CATEGORIES,
};
