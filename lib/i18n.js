'use strict';

// Log messages and default names in English (default) and Hebrew.
// Add a language by adding one more object here.

const messages = {
    en: {
        light: 'Light',
        added: 'Added {name}',
        removing: 'Removing {n} accessory(ies) no longer in the config.',
        noDevices: 'No valid devices configured. Open the plugin settings and use "Find my fans".',
        skipping: 'Skipping device "{name}": {problem}',
        pInvalid: 'invalid entry',
        pName: 'missing "name"',
        pId: 'missing "id" (the Tuya device ID)',
        pKey: 'missing "key" (the Tuya local key)',
        pKeyLen: 'the local key must be exactly 16 characters',
        looking: 'Looking for {n} device(s) on the local network...',
        ignoring: 'Ignoring Tuya device {id}: not in the config.',
        fallbackIp: '{name}: not seen in discovery, connecting to the configured IP {ip}.',
        notFound: '{name}: not found on the network yet. Still looking. Set "ip" in the config to skip discovery.',
        ipChanged: '{name}: address changed to {ip}.',
        connecting: '{name}: connecting to {ip} (protocol {version}).',
        connected: '{name}: connected over the local network.',
        firstState: '{name}: data points reported by the fan: {dps}',
        missingDp: '{name}: the fan did not report data point(s) {dps}. If a function does nothing, run "Find my fans" in the plugin settings again or set the data point numbers manually.',
        notConnected: '{name}: not connected, command dropped.',
        sending: '{name}: sending {dps}',
        miredRange: '{name}: maxMired must be larger than minMired; using {min}-{max}.',
    },
    he: {
        light: 'תאורה',
        added: 'נוסף {name}',
        removing: 'מסיר {n} אביזרים שכבר לא מופיעים בהגדרות.',
        noDevices: 'לא הוגדרו מכשירים תקינים. פתח את הגדרות הפלאגין והשתמש ב"מצא את המאווררים שלי".',
        skipping: 'מדלג על המכשיר "{name}": {problem}',
        pInvalid: 'רשומה לא תקינה',
        pName: 'חסר "name" (שם)',
        pId: 'חסר "id" (מזהה המכשיר של Tuya)',
        pKey: 'חסר "key" (המפתח המקומי של Tuya)',
        pKeyLen: 'המפתח המקומי חייב להיות בדיוק 16 תווים',
        looking: 'מחפש {n} מכשירים ברשת המקומית...',
        ignoring: 'מתעלם ממכשיר Tuya {id}: לא מופיע בהגדרות.',
        fallbackIp: '{name}: לא נמצא בגילוי אוטומטי, מתחבר לכתובת IP שהוגדרה {ip}.',
        notFound: '{name}: עדיין לא נמצא ברשת. ממשיך לחפש. אפשר להגדיר "ip" כדי לדלג על הגילוי.',
        ipChanged: '{name}: הכתובת השתנתה ל-{ip}.',
        connecting: '{name}: מתחבר ל-{ip} (פרוטוקול {version}).',
        connected: '{name}: מחובר ברשת המקומית.',
        firstState: '{name}: נקודות הנתונים שהמאוורר דיווח: {dps}',
        missingDp: '{name}: המאוורר לא דיווח על נקודות נתונים {dps}. אם פונקציה לא עובדת, הרץ שוב "מצא את המאווררים שלי" בהגדרות הפלאגין או הגדר את מספרי נקודות הנתונים ידנית.',
        notConnected: '{name}: לא מחובר, הפקודה לא נשלחה.',
        sending: '{name}: שולח {dps}',
        miredRange: '{name}: maxMired חייב להיות גדול מ-minMired; משתמש ב-{min}-{max}.',
    },
};

function createT(language) {
    const table = messages[language] || messages.en;
    return (key, params = {}) => {
        const text = table[key] !== undefined ? table[key] : messages.en[key] !== undefined ? messages.en[key] : key;
        return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
    };
}

module.exports = {createT, messages};
