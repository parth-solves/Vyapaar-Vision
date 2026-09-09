# Vyapar Vision — marketplace label analytics

Upload shipping-label PDFs from Amazon, Flipkart, Meesho, Myntra, or Ajio.
The app detects which marketplace each one is from, reads what's actually
printed on the label, and turns it into a sales dashboard — all inside your
browser, with no backend and no database.

*Vyapar* (व्यापार) means "business/trade" in Hindi — the name is meant to
read as India-first while still being easy for anyone to say.

## What's in each file

```
vyapar-vision/
├── index.html            → Home page (pitch/marketing screen)
├── app.html               → The actual tool — upload panel + dashboard
├── css/style.css           → All styling: design tokens, dark/light theme, both screens
├── js/
│   ├── theme.js            → Dark/light toggle, shared by both screens
│   ├── home.js              → Powers the home page's animated "order pulse" strip
│   ├── parser.js            → Marketplace detection, field extraction, PIN→state, gender estimate
│   └── app.js               → Upload handling, chart rendering, exports
├── data/
│   └── sample-orders.json    → Backs the "Try with sample data" button
└── README.md
```

Two screens now, not one: `index.html` is what a visitor or judge sees
first — the pitch. `app.html` is where the actual upload-and-analyze work
happens. They share the same design system and theme toggle.

## Read this before your demo — what's real vs. estimated

Shipping labels only ever print a fixed set of things. This app is tuned
against a real Meesho "Sub Order" label PDF (the combined label + tax
invoice format, detected by structure — Purchase Order No./Invoice
No./Order Date table + "BILL TO / SHIP TO" + "Sold by"/GSTIN — since it
carries no literal brand name).

| Shown on the dashboard | Where it comes from |
|---|---|
| Marketplace | Detected from text, or (for Meesho) label structure |
| Order ID | Read from the "Purchase Order No." table or Amazon's `xxx-xxxxxxx-xxxxxxx` format; if text extraction doesn't find one, the label's own QR/barcode is decoded and used instead (see below) |
| Amount | Read from the label's "Total" row (grand total, tax included) |
| Payment type (COD/Prepaid) | Read from the label — e.g. Meesho only prints "COD:" for cash orders; its absence means Prepaid |
| Payment method (UPI/card/netbanking) | Only shown if the label prints it — often reads "Not shown on label" |
| Region / state | Looked up from the destination PIN code (the first 6-digit pincode on the label) using an approximate 2-digit prefix table |
| **City** | Looked up from the same PIN's first **3** digits against a table of ~50 major Indian cities/metros (Pune, Mumbai, Bengaluru, etc.) — unlisted pincodes show as "Other (state)" rather than a wrong guess |
| Order date | Read from the label if printed (DD/MM/YYYY and DD.MM.YYYY both supported) |
| **Gender** | **Estimated** from the customer's first name against a ~500-name dictionary spanning Hindi/Hindu, Muslim, Sikh, Bengali, Marathi, Gujarati, South Indian, and common Western/international names. Marked "estimated" everywhere it's shown. Deliberately unisex names (Kiran, Simran, etc.) are left out rather than guessed |

## QR/barcode cross-check

Every label carries a QR code or barcode that encodes the order/tracking
number directly. When the on-page text doesn't yield a clean order ID (an
unfamiliar label layout, an OCR misread, etc.), the app decodes that code
with jsQR and uses it instead — reading the code is more reliable than
regexing text, since it's exactly what the courier itself scans. Each
order's `orderIdSource` field (visible in CSV/JSON exports) tells you
whether the ID came from the label's text or from the QR/barcode, so you
can always tell which path was used.

There's no age feature — no shipping label carries a birth date or age
bracket, and this version doesn't attempt to estimate one. If you need age
data for ad targeting, that has to come from your own customer records,
outside this tool.

A single PDF can contain multiple sub-order labels (common with bulk label
downloads) — the app reads every page and adds each as its own order.

## Scanned / photographed PDFs

Most label PDFs contain real text and parse instantly. If a label is a
scanned image instead, the app automatically falls back to on-device OCR
(Tesseract.js) — slower, but means image-only PDFs still get read.

## Running it locally in VS Code

1. Open the `vyapar-vision` folder in VS Code.
2. Install the **"Live Server"** extension from the Extensions panel.
3. Right-click `index.html` → **"Open with Live Server"**.
4. Click through to the app, then **"Try with sample data"** to confirm
   everything renders before testing a real label PDF.

## Customizing without coding

- **Colors** — top of `css/style.css`, edit the hex values next to names
  like `--marigold:`.
- **Which names count as which gender** — `js/parser.js`, the
  `FEMALE_NAMES` / `MALE_NAMES` sets near the top. Add names as plain
  lowercase words; leave a name out of both if it's genuinely unisex.
- **PIN-to-state mapping** — `js/parser.js`, the `PIN_STATE_TABLE` array.
- **PIN-to-city mapping** — `js/parser.js`, the `PIN_CITY_TABLE` object. Add a `'xyz': 'City Name'` entry (first 3 digits of any pincode you want recognized) to extend coverage beyond the current ~50 metros.
- **Home page copy** — all plain text inside `index.html`.
- **Sample dashboard data** — `data/sample-orders.json`.

## Push to GitHub

```bash
git init
git add .
git commit -m "Vyapar Vision — refined UI, two screens, no age feature"
```
Then create an empty repo on github.com and run the `git remote add` /
`git push` commands it shows you.

## Deploy to Vercel

1. [vercel.com](https://vercel.com) → sign in with GitHub.
2. **Add New → Project** → select this repo.
3. Leave all settings default (static site, no build command) → **Deploy**.
4. Every push to `main` redeploys automatically. `index.html` (the home
   page) loads at your root URL by default — exactly what you want.

## Before your demo

- Test with 2–3 real label PDFs from your own account ahead of time —
  formats vary by marketplace, so confirm the fields you care about most
  come through correctly.
- Keep "Try with sample data" as your safety net for a live demo.
- If a judge asks about gender: it's a name-based estimate, clearly
  labeled as such everywhere it appears — say so proactively, it reads as
  more credible than claiming certainty the data can't support.
