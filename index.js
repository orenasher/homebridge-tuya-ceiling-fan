'use strict';

const TuyaAccessory = require('./lib/TuyaAccessory');
const TuyaDiscovery = require('./lib/TuyaDiscovery');
const FanLightAccessory = require('./lib/FanLightAccessory');
const {createT} = require('./lib/i18n');

const PLUGIN_NAME = 'homebridge-tuya-ceiling-fan';
const PLATFORM_NAME = 'TuyaCeilingFan';
const DEFAULT_DISCOVER_TIMEOUT_MS = 15000;
const FALLBACK_VERSION = '3.3';

class TuyaCeilingFanPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config || {};
        this.api = api;
        this.t = createT(this.config.language);

        this.cachedAccessories = new Map(); // uuid -> restored PlatformAccessory
        this.handlers = new Map(); // tuya id -> FanLightAccessory
        this.deviceConfigs = new Map(); // tuya id -> device config
        this.connected = new Map(); // tuya id -> TuyaAccessory

        // Overridable so tests can plug in a fake device without touching the network.
        this.createDevice = props => new TuyaAccessory(props);
        this.discovery = TuyaDiscovery;

        api.on('didFinishLaunching', () => this.start());
        api.on('shutdown', () => this.stop());
    }

    configureAccessory(accessory) {
        this.cachedAccessories.set(accessory.UUID, accessory);
    }

    start() {
        const devices = Array.isArray(this.config.devices) ? this.config.devices : [];
        const wanted = new Set();

        devices.forEach(cfg => {
            const problem = this._validate(cfg);
            if (problem) {
                this.log.error(this.t('skipping', {name: cfg && cfg.name, problem}));
                return;
            }
            const id = String(cfg.id).trim();
            const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${id}`);
            wanted.add(uuid);

            let accessory = this.cachedAccessories.get(uuid);
            if (!accessory) {
                accessory = new this.api.platformAccessory(cfg.name, uuid, this.api.hap.Categories.FAN);
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                this.log.info(this.t('added', {name: cfg.name}));
            }
            accessory.context.id = id;

            this.deviceConfigs.set(id, cfg);
            this.handlers.set(id, new FanLightAccessory(this, accessory, cfg));
        });

        const stale = [...this.cachedAccessories.values()].filter(a => !wanted.has(a.UUID));
        if (stale.length) {
            this.log.info(this.t('removing', {n: stale.length}));
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
        }

        if (!this.handlers.size) {
            this.log.warn(this.t('noDevices'));
            return;
        }
        this._discover();
    }

    stop() {
        try {
            this.discovery.stop();
        } catch (e) {
            // already stopped
        }
    }

    _validate(cfg) {
        if (!cfg || typeof cfg !== 'object') return this.t('pInvalid');
        if (!cfg.name) return this.t('pName');
        if (!cfg.id) return this.t('pId');
        if (!cfg.key) return this.t('pKey');
        if (Buffer.byteLength(String(cfg.key), 'utf8') !== 16) {
            return this.t('pKeyLen');
        }
        return null;
    }

    _discover() {
        const ids = [...this.handlers.keys()];
        this.log.info(this.t('looking', {n: ids.length}));

        this.discovery.start({ids, log: this.log}).on('discover', found => {
            if (!found || !found.id) return;
            const cfg = this.deviceConfigs.get(found.id);
            if (!cfg) {
                this.log.debug(this.t('ignoring', {id: found.id}));
                return;
            }
            this._connect(found.id, cfg.ip || found.ip, cfg.version || found.version);
        });

        setTimeout(() => {
            ids.forEach(id => {
                if (this.connected.has(id)) return;
                const cfg = this.deviceConfigs.get(id);
                if (cfg.ip) {
                    this.log.info(this.t('fallbackIp', {name: cfg.name, ip: cfg.ip}));
                    this._connect(id, cfg.ip, cfg.version || FALLBACK_VERSION);
                } else {
                    this.log.warn(this.t('notFound', {name: cfg.name}));
                }
            });
        }, this.config.discoverTimeout || DEFAULT_DISCOVER_TIMEOUT_MS);
    }

    _connect(id, ip, version) {
        const existing = this.connected.get(id);
        if (existing) {
            // Already connected once. If the router handed the fan a new address, follow it.
            if (ip && existing.context && existing.context.ip !== ip) {
                this.log.info(this.t('ipChanged', {name: this.deviceConfigs.get(id).name, ip}));
                existing.context.ip = ip;
            }
            return;
        }

        const cfg = this.deviceConfigs.get(id);
        this.log.info(this.t('connecting', {name: cfg.name, ip, version: version || FALLBACK_VERSION}));

        const device = this.createDevice({
            id,
            key: String(cfg.key),
            ip,
            version: version || FALLBACK_VERSION,
            name: cfg.name,
            log: this.log,
        });
        this.connected.set(id, device);
        this.handlers.get(id).attachDevice(device);
    }
}

module.exports = api => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TuyaCeilingFanPlatform);
};

module.exports.TuyaCeilingFanPlatform = TuyaCeilingFanPlatform;
