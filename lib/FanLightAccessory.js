'use strict';

const conv = require('./convert');

const DEFAULT_MIN_MIRED = 154; // coolest (about 6500 K)
const DEFAULT_MAX_MIRED = 370; // warmest (about 2700 K)
const WRITE_DELAY_MS = 80; // merge HomeKit's burst of writes (Active + RotationSpeed) into one packet

const isTrue = v => v === true || v === 'true' || v === 1 || v === '1';

const boolOpt = (value, fallback) => (value === undefined || value === null ? fallback : !!value);
const dpOpt = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value);
};

class FanLightAccessory {
    constructor(platform, accessory, config) {
        this.platform = platform;
        this.accessory = accessory;
        this.log = platform.log;
        this.t = platform.t;
        this.config = config;
        this.name = config.name;

        const {Service, Characteristic} = platform.api.hap;
        this.Service = Service;
        this.Characteristic = Characteristic;

        // ---- data points (defaults match the common Tuya "fsd" ceiling-fan-light) ----
        this.dpFanOn = dpOpt(config.dpFanOn, '60');
        this.dpFanSpeed = dpOpt(config.dpFanSpeed, '62');
        this.dpFanDirection = dpOpt(config.dpFanDirection, '63');
        this.dpSwing = dpOpt(config.dpSwing, null);
        this.dpLightOn = dpOpt(config.dpLightOn, '20');
        this.dpBrightness = dpOpt(config.dpBrightness, '22');
        this.dpColorTemp = dpOpt(config.dpColorTemp, '23');

        // ---- fan behaviour ----
        this.maxSpeed = Math.max(1, conv.toInt(config.maxSpeed, 6));
        this.defaultSpeed = conv.clamp(conv.toInt(config.fanDefaultSpeed, 1), 1, this.maxSpeed);
        // 'percent' (default): slider 0-100 % in steps of 100/maxSpeed, like most fan plugins.
        // 'levels': slider 0..maxSpeed in steps of 1.
        this.speedDisplay = config.speedDisplay === 'levels' ? 'levels' : 'percent';
        this.speedAsString = boolOpt(config.speedAsString, true);
        // Optional: explicit list of the fan's speed values (slowest first), or a 1..100 percent speed.
        const values = Array.isArray(config.speedValues)
            ? config.speedValues.map(v => String(v).trim()).filter(v => v.length)
            : [];
        this.speedOpts = {values: values.length ? values : undefined, percent: boolOpt(config.speedPercent, false)};
        if (values.length) this.maxSpeed = values.length;
        if (this.speedOpts.percent) this.speedAsString = boolOpt(config.speedAsString, false);
        this.singleDpWrites = boolOpt(config.singleDpWrites, false);
        this.hasDirection = boolOpt(config.useDirection, true);
        this.directionForward = config.directionForward || 'forward';
        this.directionReverse = config.directionReverse || 'reverse';

        // ---- light behaviour ----
        this.hasLight = boolOpt(config.useLight, true);
        this.hasBrightness = this.hasLight && boolOpt(config.useBrightness, true);
        this.hasColorTemp = this.hasLight && boolOpt(config.useColorTemp, true);
        this.lightValuesAsString = boolOpt(config.lightValuesAsString, false);
        this.brightMin = conv.toInt(config.brightMin, 10);
        this.brightMax = conv.toInt(config.brightMax, 1000);
        this.tempMax = conv.toInt(config.tempMax, 1000);
        this.minMired = conv.toInt(config.minMired, DEFAULT_MIN_MIRED);
        this.maxMired = conv.toInt(config.maxMired, DEFAULT_MAX_MIRED);
        if (this.maxMired <= this.minMired) {
            this.log.warn(this.t('miredRange', {name: this.name, min: DEFAULT_MIN_MIRED, max: DEFAULT_MAX_MIRED}));
            this.minMired = DEFAULT_MIN_MIRED;
            this.maxMired = DEFAULT_MAX_MIRED;
        }
        this.lightModes = conv.normalizeModes(config.lightModes, this.lightValuesAsString);

        this.defaultSpeed = conv.clamp(this.defaultSpeed, 1, this.maxSpeed);
        this.dps = {};
        this.lastSpeed = this.defaultSpeed;
        this.pending = {};
        this.timer = null;
        this.device = null;

        this._setupAccessoryInfo();
        this._setupFan();
        this._setupLight();
    }

    // ------------------------------------------------------------------ setup

    _setupAccessoryInfo() {
        const {Service, Characteristic} = this;
        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, this.config.manufacturer || 'Tuya')
            .setCharacteristic(Characteristic.Model, this.config.model || 'Ceiling Fan')
            .setCharacteristic(Characteristic.SerialNumber, String(this.config.id));
    }

    _setupFan() {
        const {Service, Characteristic} = this;
        this.fanService = this.accessory.getService(Service.Fanv2)
            || this.accessory.addService(Service.Fanv2, this.name);
        this.fanService.setCharacteristic(Characteristic.Name, this.name);

        this.fanService.getCharacteristic(Characteristic.Active)
            .onGet(() => this._fanActive())
            .onSet(v => this._setFanActive(v));

        const speedProps = this.speedDisplay === 'levels'
            ? {minValue: 0, maxValue: this.maxSpeed, minStep: 1}
            : {minValue: 0, maxValue: 100, minStep: 100 / this.maxSpeed};
        this.fanService.getCharacteristic(Characteristic.RotationSpeed)
            .setProps(speedProps)
            .onGet(() => this._fanSpeedValue())
            .onSet(v => this._setFanSpeedValue(v));

        if (this.hasDirection) {
            this.fanService.getCharacteristic(Characteristic.RotationDirection)
                .onGet(() => this._direction())
                .onSet(v => this._setDirection(v));
        } else {
            this._removeCharacteristic(this.fanService, Characteristic.RotationDirection);
        }

        if (this.dpSwing) {
            this.fanService.getCharacteristic(Characteristic.SwingMode)
                .onGet(() => this._swing())
                .onSet(v => this._setSwing(v));
        } else {
            this._removeCharacteristic(this.fanService, Characteristic.SwingMode);
        }
    }

    _setupLight() {
        const {Service, Characteristic} = this;
        let service = this.accessory.getServiceById(Service.Lightbulb, 'light');
        if (!service) service = this.accessory.getService(Service.Lightbulb);

        if (!this.hasLight) {
            if (service) this.accessory.removeService(service);
            this.lightService = null;
            return;
        }

        this.lightService = service
            || this.accessory.addService(Service.Lightbulb, `${this.name} ${this.t('light')}`, 'light');
        this.lightService.setCharacteristic(Characteristic.Name, `${this.name} ${this.t('light')}`);

        this.lightService.getCharacteristic(Characteristic.On)
            .onGet(() => this._lightOn())
            .onSet(v => this._setLightOn(v));

        if (this.hasBrightness) {
            // Brightness stays a normal 0-100 % slider.
            this.lightService.getCharacteristic(Characteristic.Brightness)
                .setProps({minValue: 0, maxValue: 100, minStep: 1})
                .onGet(() => this._brightness())
                .onSet(v => this._setBrightness(v));
        } else {
            this._removeCharacteristic(this.lightService, Characteristic.Brightness);
        }

        if (this.hasColorTemp) {
            this.lightService.getCharacteristic(Characteristic.ColorTemperature)
                .setProps({minValue: this.minMired, maxValue: this.maxMired, minStep: 1})
                .onGet(() => this._colorTemp())
                .onSet(v => this._setColorTemp(v));
        } else {
            this._removeCharacteristic(this.lightService, Characteristic.ColorTemperature);
        }
    }

    _removeCharacteristic(service, characteristic) {
        if (service.testCharacteristic(characteristic)) {
            service.removeCharacteristic(service.getCharacteristic(characteristic));
        }
    }

    // ------------------------------------------------------------------ device link

    attachDevice(device) {
        this.device = device;
        device.on('connect', () => {
            // Many Tuya devices recycle their local socket now and then. Say it once at info
            // level; later silent reconnects are only visible in debug mode.
            const level = this.connectedOnce ? 'debug' : 'info';
            this.connectedOnce = true;
            this.log[level](this.t('connected', {name: this.name}));
        });
        device.on('change', (changes, state) => {
            this._reportOnce(state);
            this.dps = {...state};
            this._remember();
            this.refresh();
        });
        if (device.state) {
            this.dps = {...device.state};
            this._remember();
        }
    }

    // Log the data points once so a wrong DP number is easy to spot, and warn about missing ones.
    _reportOnce(state) {
        if (this.reported || !state || !Object.keys(state).length) return;
        this.reported = true;
        this.log.info(this.t('firstState', {name: this.name, dps: JSON.stringify(state)}));
        const used = [this.dpFanOn, this.dpFanSpeed];
        if (this.hasLight) used.push(this.dpLightOn);
        const missing = used.filter(dp => dp !== null && state[dp] === undefined);
        if (missing.length) this.log.warn(this.t('missingDp', {name: this.name, dps: missing.join(', ')}));
    }

    _remember() {
        const level = conv.speedFromTuya(this.dps[this.dpFanSpeed], this.maxSpeed, this.speedOpts);
        if (level > 0) this.lastSpeed = level;
    }

    refresh() {
        const {Characteristic} = this;
        this.fanService.updateCharacteristic(Characteristic.Active, this._fanActive());
        this.fanService.updateCharacteristic(Characteristic.RotationSpeed, this._fanSpeedValue());
        if (this.hasDirection) {
            this.fanService.updateCharacteristic(Characteristic.RotationDirection, this._direction());
        }
        if (this.dpSwing) {
            this.fanService.updateCharacteristic(Characteristic.SwingMode, this._swing());
        }
        if (!this.lightService) return;
        this.lightService.updateCharacteristic(Characteristic.On, this._lightOn());
        if (this.hasBrightness) {
            this.lightService.updateCharacteristic(Characteristic.Brightness, this._brightness());
        }
        if (this.hasColorTemp) {
            this.lightService.updateCharacteristic(Characteristic.ColorTemperature, this._colorTemp());
        }
    }

    // ------------------------------------------------------------------ writes

    _write(dps) {
        if (!this.device || !this.device.connected) {
            const {HapStatusError, HAPStatus} = this.platform.api.hap;
            this.log.warn(this.t('notConnected', {name: this.name}));
            throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        Object.assign(this.pending, dps);
        Object.assign(this.dps, dps); // optimistic, so a read right after a write is consistent
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this._flush(), WRITE_DELAY_MS);
    }

    _flush() {
        this.timer = null;
        const dps = this.pending;
        this.pending = {};
        if (!this.device || !Object.keys(dps).length) return;
        this.log.debug(this.t('sending', {name: this.name, dps: JSON.stringify(dps)}));
        if (this.singleDpWrites) {
            Object.keys(dps).forEach(dp => this.device.update({[dp]: dps[dp]}));
        } else {
            this.device.update(dps);
        }
    }

    // ------------------------------------------------------------------ fan

    _fanActive() {
        return isTrue(this.dps[this.dpFanOn]) ? 1 : 0;
    }

    _fanLevel() {
        if (!this._fanActive()) return 0;
        return conv.speedFromTuya(this.dps[this.dpFanSpeed], this.maxSpeed, this.speedOpts);
    }

    _setFanActive(value) {
        if (value) {
            this._write({
                [this.dpFanOn]: true,
                [this.dpFanSpeed]: conv.speedToTuya(this.lastSpeed, this.maxSpeed, this.speedAsString, this.speedOpts),
            });
        } else {
            this._write({[this.dpFanOn]: false});
        }
    }

    // What HomeKit sees: a level (levels mode) or a percent (default).
    _fanSpeedValue() {
        const level = this._fanLevel();
        return this.speedDisplay === 'levels' ? level : Math.min(100, (level * 100) / this.maxSpeed);
    }

    _setFanSpeedValue(value) {
        const v = Number(value) || 0;
        if (this.speedDisplay === 'levels' || v <= 0) return this._setFanLevel(v);
        return this._setFanLevel(conv.clamp(Math.round((v * this.maxSpeed) / 100), 1, this.maxSpeed));
    }

    _setFanLevel(level) {
        const v = conv.toInt(level);
        if (v <= 0) {
            this._write({[this.dpFanOn]: false});
            return;
        }
        this.lastSpeed = conv.clamp(v, 1, this.maxSpeed);
        this._write({
            [this.dpFanOn]: true,
            [this.dpFanSpeed]: conv.speedToTuya(this.lastSpeed, this.maxSpeed, this.speedAsString, this.speedOpts),
        });
    }

    _direction() {
        const {RotationDirection} = this.Characteristic;
        return String(this.dps[this.dpFanDirection]) === String(this.directionReverse)
            ? RotationDirection.COUNTER_CLOCKWISE
            : RotationDirection.CLOCKWISE;
    }

    _setDirection(value) {
        const {RotationDirection} = this.Characteristic;
        this._write({
            [this.dpFanDirection]: value === RotationDirection.COUNTER_CLOCKWISE
                ? this.directionReverse
                : this.directionForward,
        });
    }

    _swing() {
        const {SwingMode} = this.Characteristic;
        return isTrue(this.dps[this.dpSwing]) ? SwingMode.SWING_ENABLED : SwingMode.SWING_DISABLED;
    }

    _setSwing(value) {
        const {SwingMode} = this.Characteristic;
        this._write({[this.dpSwing]: value === SwingMode.SWING_ENABLED});
    }

    // ------------------------------------------------------------------ light

    _lightOn() {
        return isTrue(this.dps[this.dpLightOn]);
    }

    _setLightOn(value) {
        this._write({[this.dpLightOn]: !!value});
    }

    _brightness() {
        return conv.brightnessFromTuya(this.dps[this.dpBrightness], this.brightMin, this.brightMax);
    }

    _setBrightness(percent) {
        const p = conv.toInt(percent);
        if (p <= 0) {
            this._write({[this.dpLightOn]: false});
            return;
        }
        this._write({
            [this.dpLightOn]: true,
            [this.dpBrightness]: conv.brightnessToTuya(p, this.brightMin, this.brightMax, this.lightValuesAsString),
        });
    }

    _colorTemp() {
        const raw = this.dps[this.dpColorTemp];
        if (this.lightModes.length) {
            return conv.miredFromMode(raw, this.lightModes, this.minMired, this.maxMired);
        }
        return conv.colorTempFromTuya(raw, this.minMired, this.maxMired, this.tempMax);
    }

    _setColorTemp(mired) {
        const value = this.lightModes.length
            ? conv.modeFromMired(mired, this.lightModes, this.minMired, this.maxMired)
            : conv.colorTempToTuya(mired, this.minMired, this.maxMired, this.lightValuesAsString, this.tempMax);
        this._write({[this.dpColorTemp]: value});
    }
}

module.exports = FanLightAccessory;
