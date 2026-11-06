# homebridge-tuya-ceiling-fan

English | [עברית](README.he.md)

Homebridge plugin for Tuya Wi-Fi ceiling fans, controlled **locally** over your network (no cloud while running).

- **Setup wizard in the plugin settings.** Enter your Tuya developer keys once and the plugin finds every fan in your Smart Life / Tuya Smart app and fills in the device ID, the local key and the data points for you. Works with any Tuya ceiling fan.
- **Fan speed matched to the fan's real speeds.** The slider moves in N exact steps (for a 6-speed fan: 17, 33, 50, 67, 83, 100 %). Optional `speedDisplay: "levels"` makes the slider 0 to N in steps of 1.
- **Light brightness in percent**, and **light modes** (colour temperature, or fixed modes such as warm / normal / cool).
- Fan direction (forward / reverse) and optional oscillation.
- Finds the fan on your network automatically and follows it if its IP address changes.
- **English and Hebrew** (settings wizard and log messages). English is the default.

## Install

Search for `Tuya Ceiling Fan` in Homebridge Config UI X, or run:

    sudo npm install -g homebridge-tuya-ceiling-fan

Requires Homebridge 1.6 or newer and Node.js 18.15 or newer.

## Add your fans (about 10 minutes, once)

Open the plugin settings. The wizard has the same guide built in, in English and Hebrew.

1. Open [iot.tuya.com](https://iot.tuya.com) and sign in or create a free account.
2. Go to Cloud, Development, Create Cloud Project. Industry: Smart Home. Development Method: Smart Home. Data Center: the region of your app account (Israel and Europe: Central Europe). If you are not sure, the wizard can detect it.
3. Keep the default APIs. Make sure **IoT Core** and **Authorization Token Management** are on the project's Service API list. They are free.
4. In the project open Devices, Link App Account, Add App Account. A QR code appears. In the Smart Life / Tuya Smart app tap Me, then the scan icon at the top, scan the code and confirm.
5. Open the project's Overview tab and copy the **Access ID** and the **Access Secret** into the wizard.
6. Press **Find my fans**, tick your fans, press **Add selected** and restart Homebridge.

The Access Secret is only used at that moment to read your device list. It is not saved. After setup the plugin does not use the internet: the fans are controlled over your local network. The fan and Homebridge must be on the same network.

If the app account is ever removed from Tuya, or you remove and re-add the fan in the app, its local key changes. Run the wizard again.

## Manual configuration

You can also edit `config.json` yourself:

    {
      "platforms": [
        {
          "platform": "TuyaCeilingFan",
          "language": "en",
          "devices": [
            {
              "name": "Living room fan",
              "id": "032000123456789abcde",
              "key": "0123456789abcdef",
              "maxSpeed": 6,
              "dpFanOn": 60,
              "dpFanSpeed": 62,
              "dpLightOn": 20,
              "dpBrightness": 22,
              "dpColorTemp": 23
            }
          ]
        }
      ]
    }

| Option | Default | Meaning |
| --- | --- | --- |
| `language` | `en` | `en` or `he` (wizard and log messages) |
| `name` | | Name in the Home app |
| `id`, `key` | | Tuya device ID and 16 character local key |
| `ip` | automatic | Set if the fan is not found automatically |
| `version` | automatic | Tuya protocol version: 3.1, 3.3, 3.4, 3.5 |
| `maxSpeed` | 6 | Number of fan speeds |
| `speedDisplay` | `percent` | `percent` (0-100 % in N steps) or `levels` (0 to N in steps of 1) |
| `useLight` | true | Set false if the fan has no light |
| `useBrightness` | true | Light brightness (percent) |
| `useColorTemp` | true | Light colour temperature or modes |
| `lightModes` | | Fixed light modes instead of a smooth colour temperature, warmest first, e.g. `["warm", "normal", "cool"]` or `["0", "500", "1000"]` |
| `useDirection` | true | Forward / reverse |

### Data points

Tuya devices describe each function as a numbered data point (DP). The wizard reads them for you. Without the wizard the defaults are the common ceiling-fan-with-light layout:

| Function | Option | Default |
| --- | --- | --- |
| Fan on/off | `dpFanOn` | 60 |
| Fan speed | `dpFanSpeed` | 62 |
| Fan direction | `dpFanDirection` | 63 |
| Oscillation (optional) | `dpSwing` | none |
| Light on/off | `dpLightOn` | 20 |
| Light brightness | `dpBrightness` | 22 |
| Light colour temperature or mode | `dpColorTemp` | 23 |

When a fan connects, the plugin writes the data points it reports to the Homebridge log, and warns if one of the configured numbers is missing. That makes a wrong number easy to find.

Other advanced options: `directionForward` and `directionReverse`, `speedAsString` (default true), `speedValues` (for fans with named speeds such as low, mid, high), `speedPercent` (for fans whose speed is 1 to 100), `brightMin` and `brightMax` (default 10 and 1000), `tempMax` (default 1000), `lightValuesAsString`, `singleDpWrites` (turn on if the light works but the fan ignores commands), `minMired` and `maxMired` (default 154 and 370), `fanDefaultSpeed` (default 1).

### Light modes

- Smooth colour temperature (most tunable lights): leave `lightModes` empty.
- A few fixed modes: put the values your fan expects in `lightModes`, warmest first. They are spread evenly across the warm to cool range, so Apple Home's colour presets pick real modes.

## Notes

- Apple Home may keep old slider settings. If you changed `maxSpeed` and the slider looks wrong, remove the accessory in Homebridge UI (Settings, Remove Single Cached Accessory) and restart.
- If the fan is offline, controls in the Home app show No Response.
- If you used another Tuya plugin for the same fan, remove it from that plugin first, otherwise the fan appears twice.

## Credits

The local Tuya protocol layer (`lib/TuyaAccessory.js`, `lib/TuyaDiscovery.js`) comes from [homebridge-tuya-plus](https://github.com/adrianjagielak/homebridge-tuya-plus), which builds on homebridge-tuya, homebridge-tuya-lan and TuyAPI. All MIT licensed.

## License

MIT
