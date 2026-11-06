'use strict';

// Logic behind the setup wizard in the Homebridge UI. Kept separate from the UI server
// so it can be tested without Homebridge.

const {TuyaCloud, CloudError, mapFan, isFanLike} = require('./cloud');

const describe = e => {
    if (e instanceof CloudError) return {code: e.code, msg: e.msg};
    return {code: 'network', msg: (e && e.message) || String(e)};
};

class Wizard {
    constructor({fetchImpl, now} = {}) {
        this.fetchImpl = fetchImpl;
        this.now = now;
        this.cloud = null;
    }

    async connect({accessId, accessSecret, region}) {
        if (!accessId || !accessSecret) return {ok: false, error: {code: 'missing', msg: 'Access ID and Secret are required.'}};
        try {
            this.cloud = new TuyaCloud({accessId, accessSecret, region: region || 'auto', fetchImpl: this.fetchImpl, now: this.now});
            const regionKey = await this.cloud.connect();
            const list = await this.cloud.listDevices();
            const devices = [];
            for (const d of list) {
                const device = {...d, fanLike: isFanLike(d), mapped: null, inspectError: null};
                if (device.fanLike && d.localKey) {
                    try {
                        device.mapped = mapFan(await this.cloud.inspect(d.id));
                    } catch (e) {
                        device.inspectError = describe(e);
                    }
                }
                devices.push(device);
            }
            devices.sort((a, b) => Number(b.fanLike) - Number(a.fanLike) || String(a.name).localeCompare(String(b.name)));
            return {ok: true, region: regionKey, devices};
        } catch (e) {
            this.cloud = null;
            return {ok: false, error: describe(e)};
        }
    }

    // On demand, for devices that were not recognised as fans.
    async inspect({id}) {
        if (!this.cloud) return {ok: false, error: {code: 'session', msg: 'Session expired. Press "Find my fans" again.'}};
        try {
            return {ok: true, mapped: mapFan(await this.cloud.inspect(id))};
        } catch (e) {
            return {ok: false, error: describe(e)};
        }
    }
}

module.exports = {Wizard};
