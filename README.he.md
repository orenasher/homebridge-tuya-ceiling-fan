# homebridge-tuya-ceiling-fan

[![npm](https://img.shields.io/npm/v/homebridge-tuya-ceiling-fan)](https://www.npmjs.com/package/homebridge-tuya-ceiling-fan) [![downloads](https://img.shields.io/npm/dt/homebridge-tuya-ceiling-fan)](https://www.npmjs.com/package/homebridge-tuya-ceiling-fan) [![Donate](https://img.shields.io/badge/Donate-PayPal-blue?logo=paypal)](https://paypal.me/orenasher)

[English](README.md) | עברית

פלאגין ל-Homebridge למאווררי תקרה של Tuya עם Wi-Fi, בשליטה **מקומית** ברשת הבית (בלי ענן בזמן שהוא רץ).

- **אשף הגדרה בתוך הפלאגין.** מזינים פעם אחת את מפתחות המפתחים של Tuya, והפלאגין מוצא את כל המאווררים באפליקציית Smart Life / Tuya Smart וממלא לבד את מזהה המכשיר, המפתח המקומי ונקודות הנתונים. עובד עם כל מאוורר תקרה של Tuya.
- **מהירות שמתאימה למהירויות האמיתיות של המאוורר.** הסליידר זז ב-N צעדים מדויקים (למאוורר עם 6 מהירויות: 17, 33, 50, 67, 83, 100 אחוז). האפשרות `speedDisplay: "levels"` הופכת אותו לסליידר 0 עד N בקפיצות של 1.
- **עוצמת תאורה באחוזים**, ו**מצבי אור** (גוון אור, או מצבים קבועים כמו חם / רגיל / קר).
- כיוון סיבוב (קדימה / אחורה) ונדנוד אופציונלי.
- מוצא את המאוורר ברשת לבד ועוקב אחריו אם כתובת ה-IP שלו משתנה.
- **עברית ואנגלית** (אשף ההגדרה והודעות היומן). אנגלית היא ברירת המחדל.

## התקנה

חפש `Tuya Ceiling Fan` ב-Homebridge Config UI X, או הרץ:

    sudo npm install -g homebridge-tuya-ceiling-fan

דורש Homebridge 1.6 ומעלה ו-Node.js 18.15 ומעלה.

## הוספת המאווררים (כ-10 דקות, פעם אחת)

פתח את הגדרות הפלאגין. אותו מדריך מובנה גם באשף, בעברית ובאנגלית.

1. היכנס ל-[iot.tuya.com](https://iot.tuya.com) והתחבר או פתח חשבון חינמי.
2. לך אל Cloud, Development, Create Cloud Project. Industry: Smart Home. Development Method: Smart Home. Data Center: האזור של חשבון האפליקציה (ישראל ואירופה: Central Europe). אם לא בטוח, האשף יודע לזהות לבד.
3. השאר את ה-APIs כברירת מחדל. ודא ש-**IoT Core** ו-**Authorization Token Management** ברשימת Service API של הפרויקט. שניהם חינמיים.
4. בפרויקט פתח Devices, Link App Account, Add App Account. יופיע קוד QR. באפליקציית Smart Life / Tuya Smart לחץ על Me, אחר כך על סמל הסריקה למעלה, סרוק את הקוד ואשר.
5. פתח את לשונית Overview של הפרויקט והעתק את **Access ID** ואת **Access Secret** לאשף.
6. לחץ **מצא את המאווררים שלי**, סמן את המאווררים, לחץ **הוסף את המסומנים** והפעל מחדש את Homebridge.

ה-Access Secret משמש רק באותו רגע כדי לקרוא את רשימת המכשירים. הוא לא נשמר. אחרי ההגדרה הפלאגין לא משתמש באינטרנט: השליטה במאווררים היא ברשת המקומית. המאוורר ו-Homebridge חייבים להיות באותה רשת.

אם חשבון האפליקציה נמחק מ-Tuya, או שמסירים ומוסיפים מחדש את המאוורר באפליקציה, המפתח המקומי שלו משתנה. הרץ את האשף שוב.

## הגדרה ידנית

אפשר גם לערוך את `config.json` בעצמך. ראה את הדוגמה והטבלאות ב-[README באנגלית](README.md). אפשרויות עיקריות: `language` (‏`en` או `he`), `name`, `id`, `key`, `maxSpeed`, `useLight`, `lightModes`, `useDirection`, ומספרי נקודות נתונים כמו `dpFanOn` ו-`dpFanSpeed`.

כשמאוורר מתחבר, הפלאגין כותב ליומן של Homebridge את נקודות הנתונים שהוא מדווח עליהן, ומזהיר אם אחד המספרים שהוגדרו חסר. כך קל לאתר מספר שגוי.

### מצבי אור

- גוון אור חלק (רוב התאורות): השאר את `lightModes` ריק.
- כמה מצבים קבועים: כתוב ב-`lightModes` את הערכים שהמאוורר מצפה להם, מהחם לקר. הם מתפרשים באופן שווה על הטווח, כך שהגוונים המוכנים של אפל הום פוגעים במצבים אמיתיים.

## הערות

- אפל הום עלולה לזכור הגדרות סליידר ישנות. אם שינית `maxSpeed` והסליידר נראה שגוי, הסר את האביזר ב-Homebridge UI (Settings, Remove Single Cached Accessory) והפעל מחדש.
- אם המאוורר לא מחובר, הפקדים באפליקציית הבית יציגו "אין תגובה".
- אם השתמשת בפלאגין Tuya אחר לאותו מאוורר, הסר אותו משם קודם, אחרת המאוורר יופיע פעמיים.

## קרדיט

שכבת הפרוטוקול המקומי של Tuya (`lib/TuyaAccessory.js`, `lib/TuyaDiscovery.js`) מגיעה מ-[homebridge-tuya-plus](https://github.com/adrianjagielak/homebridge-tuya-plus), שמבוסס על homebridge-tuya, homebridge-tuya-lan ו-TuyAPI. הכול ברישיון MIT.

## תמיכה

אם התוסף חוסך לך זמן, אפשר לקנות לי קפה: [paypal.me/orenasher](https://paypal.me/orenasher). תודה!

## רישיון

MIT
