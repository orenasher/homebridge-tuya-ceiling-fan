'use strict';

const {HomebridgePluginUiServer} = require('@homebridge/plugin-ui-utils');
const {Wizard} = require('../lib/wizard');

class UiServer extends HomebridgePluginUiServer {
    constructor() {
        super();
        this.wizard = new Wizard();
        this.onRequest('/connect', body => this.wizard.connect(body || {}));
        this.onRequest('/inspect', body => this.wizard.inspect(body || {}));
        this.ready();
    }
}

(() => new UiServer())();
