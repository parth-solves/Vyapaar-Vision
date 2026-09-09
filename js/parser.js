// =====================================================================
// VYAPAR VISION — label parser
// Everything here runs 100% in the browser. No file ever leaves the
// user's machine — there is no backend and nothing is uploaded anywhere.
//
// pdf.js itself is loaded as an ES module in app.html (see the <script
// type="module"> tag there) and attached to window.pdfjsLib — that's also
// where its worker file and CDN URL are configured, since both must be
// set before pdfjsLib.getDocument() is ever called below.
//
// HONESTY NOTE (read this before demoing):
// Shipping labels print marketplace, order ID, payment type, amount, and
// destination address/pincode — never gender. So region/payment/amount
// are read for real, and gender is an ESTIMATE from the customer's first
// name against the dictionary below, labeled as an estimate everywhere
// it's shown on screen.
// =====================================================================

const MARKETPLACES = [
  { id: 'amazon', label: 'Amazon.in', color: '#F2A93B', patterns: [/\bamazon(?:\.in)?\b/i, /\bamaon\b/i, /\bAMZN\b/i, /fulfilled by amazon/i, /amazon transportation/i] },
  { id: 'flipkart', label: 'Flipkart', color: '#3FBFAD', patterns: [/flipkart/i, /\bekart\b/i, /e-?kart logistics/i] },
  { id: 'meesho', label: 'Meesho', color: '#8C7BF2', patterns: [/meesho/i] },
  { id: 'myntra', label: 'Myntra', color: '#E8685C', patterns: [/myntra/i] },
  { id: 'ajio', label: 'Ajio', color: '#5C9CE8', patterns: [/\bajio\b/i, /reliance retail/i] },
];

function detectMarketplace(text) {
  for (const mk of MARKETPLACES) {
    if (mk.patterns.some(re => re.test(text))) return mk;
  }
  // Meesho's seller-generated label+invoice PDFs often carry no literal
  // "Meesho" text at all — but the layout is distinctive: an order-header
  // table (Purchase Order No. / Invoice No. / Order Date / Invoice Date),
  // a "BILL TO / SHIP TO" block, and a "Sold by" / GSTIN line together.
  const hasOrderTable = /purchase order no\.?\s*invoice no\.?\s*order date\s*invoice date/i.test(text);
  const hasBillShip = /bill to \/ ship to/i.test(text);
  const hasSoldBy = /sold by\s*:/i.test(text) || /gstin/i.test(text);
  if (hasOrderTable && hasBillShip && hasSoldBy) {
    return { id: 'meesho', label: 'Meesho', color: '#8C7BF2' };
  }
  return { id: 'unknown', label: 'Unknown marketplace', color: '#5C6079' };
}

// Approximate India PIN-code prefix -> state table (first 2 digits).
// A simplification of the public India Post regional structure — good
// enough to bucket sales by state for marketing decisions, not meant to
// be a precise address lookup.
const PIN_STATE_TABLE = [
  { min: 11, max: 11, state: 'Delhi NCR' },
  { min: 12, max: 13, state: 'Haryana' },
  { min: 14, max: 16, state: 'Punjab' },
  { min: 17, max: 17, state: 'Himachal Pradesh' },
  { min: 18, max: 19, state: 'Jammu & Kashmir' },
  { min: 20, max: 28, state: 'Uttar Pradesh' },
  { min: 30, max: 34, state: 'Rajasthan' },
  { min: 36, max: 39, state: 'Gujarat' },
  { min: 40, max: 44, state: 'Maharashtra' },
  { min: 45, max: 48, state: 'Madhya Pradesh' },
  { min: 49, max: 49, state: 'Chhattisgarh' },
  { min: 50, max: 53, state: 'Telangana & AP' },
  { min: 56, max: 59, state: 'Karnataka' },
  { min: 60, max: 64, state: 'Tamil Nadu' },
  { min: 67, max: 69, state: 'Kerala' },
  { min: 70, max: 74, state: 'West Bengal' },
  { min: 75, max: 77, state: 'Odisha' },
  { min: 78, max: 78, state: 'Assam' },
  { min: 79, max: 79, state: 'North East' },
  { min: 80, max: 85, state: 'Bihar & Jharkhand' },
];

function pinToState(pin) {
  if (!pin || pin.length < 2) return 'Other';
  const prefix = parseInt(pin.slice(0, 2), 10);
  const hit = PIN_STATE_TABLE.find(r => prefix >= r.min && prefix <= r.max);
  return hit ? hit.state : 'Other';
}

// City-level lookup using the first 3 digits of the PIN, which India Post
// assigns to a specific sorting district — far more precise than the
// 2-digit state prefix. Covers major metros; anything not listed falls
// back to "Other (<state>)" rather than a wrong guess.
const PIN_CITY_TABLE = {
  '110': 'Delhi', '111': 'Delhi',
  '122': 'Gurugram', '121': 'Faridabad', '124': 'Rohtak', '134': 'Ambala',
  '141': 'Ludhiana', '143': 'Amritsar', '160': 'Chandigarh', '144': 'Jalandhar',
  '173': 'Shimla',
  '201': 'Ghaziabad / Noida', '226': 'Lucknow', '208': 'Kanpur', '221': 'Varanasi', '211': 'Prayagraj', '250': 'Meerut', '282': 'Agra',
  '302': 'Jaipur', '313': 'Udaipur', '342': 'Jodhpur', '324': 'Kota',
  '380': 'Ahmedabad', '390': 'Vadodara', '395': 'Surat', '360': 'Rajkot', '361': 'Rajkot', '364': 'Bhavnagar',
  '400': 'Mumbai', '401': 'Thane', '411': 'Pune', '412': 'Pune', '440': 'Nagpur', '422': 'Nashik', '431': 'Aurangabad', '413': 'Solapur', '416': 'Kolhapur', '444': 'Amravati',
  '452': 'Indore', '462': 'Bhopal', '482': 'Jabalpur', '474': 'Gwalior',
  '490': 'Raipur', '492': 'Raipur',
  '500': 'Hyderabad', '501': 'Hyderabad', '502': 'Hyderabad', '520': 'Vijayawada', '530': 'Visakhapatnam', '515': 'Anantapur',
  '560': 'Bengaluru', '570': 'Mysuru', '575': 'Mangaluru', '580': 'Hubballi',
  '600': 'Chennai', '641': 'Coimbatore', '625': 'Madurai', '620': 'Tiruchirappalli', '636': 'Salem', '628': 'Tuticorin',
  '682': 'Kochi', '695': 'Thiruvananthapuram', '673': 'Kozhikode', '680': 'Thrissur',
  '700': 'Kolkata', '711': 'Howrah', '734': 'Siliguri',
  '751': 'Bhubaneswar', '753': 'Cuttack',
  '781': 'Guwahati',
  '800': 'Patna', '834': 'Ranchi', '831': 'Jamshedpur',
  '190': 'Srinagar', '180': 'Jammu',
};

function pinToCity(pin, state) {
  if (!pin || pin.length < 3) return 'Unknown';
  const hit = PIN_CITY_TABLE[pin.slice(0, 3)];
  return hit || `Other (${state})`;
}

const PRODUCT_CATEGORIES = [
  { label: 'Fashion', words: /shirt|t-?shirt|top|dress|kurta|saree|jean|trouser|pant|shoe|sandal|slipper|bag|wallet|watch|jewel|clothing|apparel/i },
  { label: 'Beauty', words: /cream|serum|shampoo|soap|cosmetic|makeup|lipstick|perfume|skincare|hair/i },
  { label: 'Electronics', words: /phone|mobile|laptop|tablet|charger|earphone|headphone|speaker|cable|keyboard|mouse|electronic/i },
  { label: 'Home & Kitchen', words: /kitchen|cook|bottle|mug|pan|mixer|container|curtain|bedsheet|pillow|furniture|home|decor/i },
  { label: 'Grocery', words: /rice|dal|atta|flour|spice|snack|oil|tea|coffee|grocery|food/i },
  { label: 'Health', words: /vitamin|medicine|supplement|health|medical|fitness|mask/i },
  { label: 'Kids', words: /toy|baby|kid|children|diaper|school|stroller/i }
];

function classifyProduct(productName) {
  if (!productName) return 'Other';
  const category = PRODUCT_CATEGORIES.find(item => item.words.test(productName));
  return category ? category.label : 'Other';
}

// ---------------------------------------------------------------------
// Gender estimation — common first-name dictionary, spanning Hindi/Hindu,
// Muslim, Sikh, Bengali, Marathi, Gujarati, and South Indian naming
// conventions, so it has reasonable coverage across Indian marketplace
// customers. This is an ESTIMATE, not a fact — many names are genuinely
// unisex (Kiran, Simran, Gurpreet, etc.) and are deliberately left out of
// both lists rather than guessed. Add names freely below if your own
// customer base skews toward names not covered here.
// ---------------------------------------------------------------------
const MALE_NAMES = new Set([
  'aarav','aayush','abhishek','aditya','advait','aftab','akash','akshay','amandeep','amit','anand','aniket','anirudh','ankit','ansh','anwar','arav','arbaaz','arhaan','arjun','arnav','arun','asif','ashok','ashwin','atul','avinash','ayaan','ayush',
  'balwinder','bharat','bilal','chetan','chirag','danish','darshan','deepak','dev','devendra','dhruv','dinesh','disha_x','divyansh',
  'faisal','gaurav','girish','gopal','govind','gurjot',
  'harish','harjot','harsh','hassan','hemant','hussain',
  'ibrahim','imran','irfan','ishaan','ishan',
  'jagdish','jatin','jayesh',
  'kabeer','kabir','kailash','kamal','karan','karthik','kartik','kaushal','keshav','krishna','kuldeep','kunal',
  'laksh','lakshman','lalit',
  'madhav','mahesh','manav','manish','manoj','mayank','mohan','mohit','mukesh',
  'naresh','naveed','naveen','neel','neeraj','nikhil','nilesh','nirav','nitin',
  'om',
  'pankaj','parag','parth','pawan','prakash','pranav','prashant','prateek','pratik','praveen','puneet',
  'raghav','rahul','raj','rajat','rajesh','rakesh','raman','ramesh','ranjan','ravi','ravindra','reyansh','rishabh','rishi','ritesh','rizwan','rohan','rohit','rudra',
  'sachin','sagar','sahil','salman','sameer','sandeep','sanjay','santosh','sarfaraz','sarthak','satyam','saurabh','shailesh','shakeel','shantanu','sharad','shashank','shaurya','shiv','shubham','siddharth','sohan','somesh','subhash','sudhir','sumit','sunil','suraj','suresh','swapnil',
  'tanmay','tariq','tejas','tarun',
  'uday','umesh','utkarsh',
  'varun','vihaan','vijay','vikas','vikram','vimal','vinay','vinod','vipul','vishal','vishnu','vivek',
  'waseem',
  'yash','yogesh','yug','yusuf',
  'zubair',
  // Bengali
  'abhirup','amitava','anirban','arindam','ashoke','bimal','debashish','joydeep','pranab','rajarshi','sourav','subrata','sudipto','tapan',
  // South Indian (Telugu/Tamil/Kannada/Malayalam)
  'aravind','bala','chandran','dhoni','ganesh','gowtham','jagan','kishore','madhavan','murali','nandakumar','pradeep','raghavendra','ramachandran','sathish','selvam','shankar','srinivas','subramani','sundar','venkat','venkatesh','vijayan','vishwanathan',
  // World / international
  'james','john','robert','michael','william','david','richard','joseph','thomas','christopher','daniel','matthew','anthony','mark','paul','steven','andrew','kenneth','george','edward','brian','ronald','kevin','jason','jeffrey','ryan','jacob','nicholas','eric','stephen','jonathan','larry','justin','scott','brandon','benjamin','samuel','frank','raymond','alexander','patrick','jack','dennis','jerry','tyler','aaron','adam','henry','peter','carlos','juan','luis','miguel','jose','pedro','antonio','francisco','diego','mohammed','ahmed','ali','omar','khalid','lucas','mateo','sebastian','oliver','ethan','noah','liam','mason','elijah','logan','hiroshi','takashi','kenji'
]);

const FEMALE_NAMES = new Set([
  'aaradhya','aarushi','aditi','aishwarya','akansha','alia','alka','amreen','amrita','anaya','ananya','anita','anju','anjali','anshu','aparna','archana','arpita','arushi','asha','asmita','ayesha',
  'bhavana','bhavna','bhumika',
  'chandni','chitra',
  'deepa','deepali','deepika','deepti','devika','dhara','diksha','disha','divya','diya',
  'ekta',
  'farah','fatima',
  'gargi','garima','gauri','gayatri','geeta','gitanjali','gunjan',
  'harini','hema',
  'ira','isha','ishita',
  'jaya','jyoti',
  'kajal','kalpana','kamini','kanchan','kanika','karishma','kavita','kavya','ketki','khushi','kiara','kirti','komal','kritika','kusum',
  'lakshmi','lalita','latika',
  'madhavi','madhu','madhuri','mahima','mala','malati','malini','manisha','manju','manjula','mansi','maya','meena','meenal','meera','megha','meghna','mohini','monika','myra',
  'namita','nandini','navya','nazia','neelam','neelima','neeta','neha','nidhi','niharika','nikita','nilima','nirmala','nisha','nusrat',
  'padma','pallavi','parul','pooja','poonam','prachi','pragya','prerna','preeti','priti','priya','priyanka',
  'radha','radhika','rajni','rakhi','rashmi','reena','reeta','rekha','renu','riya','ritika','ritu','ruchi','ruchika','rukhsar',
  'saanvi','sabiha','sadhana','sakshi','sana','sangeeta','sanjana','sapna','sarika','sarita','sarla','sarojini','saumya','savitri','seema','shabana','shabnam','shalini','shanta','sheela','sheetal','shikha','shilpa','shivani','shobha','shreya','shruti','simran','sita','siya','smita','sneha','sonal','sonali','sonam','sudha','sujata','sulochana','sumitra','sunanda','sunita','suparna','suman','sushila','sushma','swati',
  'tabassum','tanuja','tanvi','tara','tejal','trisha',
  'uma','urmila','urvashi','usha',
  'vaishali','vandana','vania','vanita','vanya','varsha','vasudha','veena','vidya','vimla',
  'yamini','yasmin',
  'zara','zeenat','zoya',
  // Bengali
  'ipsita','madhumita','moushumi','rupa','sharmila','sohini','srabani','tanushree',
  // South Indian (Telugu/Tamil/Kannada/Malayalam)
  'anitha','bhavani','chitra','divyabharathi','janaki','kalaivani','lakshmi','meenakshi','padmavathi','pankajam','revathi','saranya','shanthi','sudha','swetha','vasantha',
  // World / international
  'mary','patricia','jennifer','linda','elizabeth','barbara','susan','jessica','sarah','karen','nancy','lisa','margaret','betty','sandra','ashley','kimberly','emily','donna','michelle','carol','amanda','melissa','deborah','stephanie','rebecca','laura','sharon','cynthia','kathleen','amy','angela','shirley','anna','brenda','pamela','emma','nicole','helen','samantha','katherine','christine','debra','rachel','catherine','carolyn','janet','maria','heather','diane','julie','joyce','victoria','kelly','christina','joan','evelyn','olivia','isabella','sophia','charlotte','amelia','mia','harper','grace','chloe','zoe','lily','ava','aisha','layla','noor','sakura','yuki'
]);

function estimateGender(fullName) {
  if (!fullName) return 'Unknown';
  const first = fullName.trim().replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!first) return 'Unknown';
  if (FEMALE_NAMES.has(first)) return 'Female';
  if (MALE_NAMES.has(first)) return 'Male';
  return 'Unknown';
}

function cleanProductName(value) {
  if (!value) return null;
  const cleaned = value
    .replace(/\bsku\s*[:#-]?\s*[A-Z0-9/_-]+/gi, '')
    .replace(/\b(?:item\s*)?(?:code|id)\s*[:#-]?\s*[A-Z0-9/_-]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:;,|-]+|[\s:;,|-]+$/g, '')
    .trim();
  return cleaned || null;
}

// ---- Field extraction from raw label text ----
function extractFields(rawText) {
  const text = rawText.replace(/[ \t]+/g, ' ').trim();
  const flat = text.replace(/\s+/g, ' '); // single-line version for patterns that don't care about line breaks

  // Order ID — try known table formats first, in order of specificity.
  let orderId = null;
  const meeshoOrderMatch = text.match(/Purchase Order No\.?\s*Invoice No\.?\s*Order Date\s*Invoice Date\s*\n?\s*(\d{6,25})/i);
  const amzMatch = flat.match(/(\d{3}-\d{7}-\d{7})/); // Amazon order id format
  const genericMatch = flat.match(/order\s*(?:id|no|number)[:\s#]*([A-Z0-9\-]{6,25})/i);
  if (meeshoOrderMatch) orderId = meeshoOrderMatch[1];
  else if (amzMatch) orderId = amzMatch[1];
  else if (genericMatch) orderId = genericMatch[1];

  // Payment type. Some labels (Meesho) only mark "COD:" directly before the
  // payable-amount line for cash orders — its absence there means Prepaid,
  // even though neither word "Prepaid" nor "COD" appears elsewhere.
  const isCOD = /COD\s*:\s*Check the payable amount/i.test(flat) || /\bCOD\b/i.test(flat) || /\bCASH ON DELIVERY\b/i.test(flat);
  const hasPayableLine = /Check the payable amount on the app/i.test(flat);
  const isPrepaidWord = /\bPREPAID\b/i.test(flat);
  let paymentType;
  if (isCOD) paymentType = 'Cash (COD)';
  else if (hasPayableLine || isPrepaidWord) paymentType = 'Prepaid';
  else paymentType = 'Not specified';

  const methodMatch = flat.match(/\b(UPI|Credit Card|Debit Card|Net\s*Banking|Wallet)\b/i);
  const paymentMethod = paymentType === 'Prepaid' && methodMatch ? methodMatch[1].replace(/\s+/g, ' ') : (paymentType === 'Prepaid' ? 'Not shown on label' : '—');

  // Amount — prefer the line-anchored "Total Rs.X Rs.Y" (grand total is the
  // last number), fall back to the largest ₹/Rs figure found anywhere.
  let amount = null;
  const totalLineMatch = flat.match(/Total\s+Rs\.?\s?[0-9,]+(?:\.[0-9]{2})?\s+Rs\.?\s?([0-9,]+(?:\.[0-9]{2})?)/i);
  if (totalLineMatch) {
    amount = parseFloat(totalLineMatch[1].replace(/,/g, ''));
  } else {
    const amountMatches = [...flat.matchAll(/(?:₹|Rs\.?|INR)\s?([0-9][0-9,]*(?:\.[0-9]{2})?)/gi)];
    if (amountMatches.length) {
      const nums = amountMatches.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0);
      if (nums.length) amount = Math.max(...nums);
    }
  }

  // PIN — the FIRST 6-digit match is the customer's destination pincode;
  // the seller/return-to address (which repeats the same pin many times)
  // always appears further down the label.
  const pinMatches = [...flat.matchAll(/\b([1-9][0-9]{5})\b/g)];
  const pin = pinMatches.length ? pinMatches[0][1] : null;

  // City must come from the bill itself. Never derive it from the PIN or state.
  const cityMatches = [
    text.match(/(?:^|\n)[ \t]*city[ \t]*:?[ \t]*(?:[ \t]*\n[ \t]*)+([^\n]+)/i),
    flat.match(/\bcity\s*:\s*([^,;|\n]+?)(?=\s+(?:state|region|marketplace)\s*:|[,;|]|$)/i)
  ];
  const billCity = (cityMatches.find(match => match)?.[1] || '').trim() || null;

  // Customer name — "BILL TO / SHIP TO" block ("Name - address...") is the
  // most reliable anchor across marketplace formats; fall back to older patterns.
  const nameMatches = [
    text.match(/(?:^|\n)[ \t]*customer\s+name[ \t]*:?[ \t]*(?:[ \t]*\n[ \t]*)+([A-Za-z][A-Za-z .]{1,40}?)[ \t]*(?=\n|$)/i),
    text.match(/BILL TO \/ SHIP TO[^\n]*\n?\s*([A-Za-z][A-Za-z .]{2,40}?)(?=\s*[-,\n])/i),
    flat.match(/(?:ship\s*to|deliver\s*to|customer\s*name|recipient\s*name)\s*:?\s*([A-Za-z][A-Za-z .]{2,40}?)(?=\s*(?:,|-|\d|\b(?:ph|phone|mob|mobile|address|pin)\b|$))/i),
    flat.match(/\bname\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,40}?)(?=\s*(?:,|-|\d|\b(?:ph|phone|mob|mobile|address|pin)\b|$))/i)
  ];
  const customerName = (nameMatches.find(match => match)?.[1] || '').trim() || null;

  // Item details vary by marketplace. Prefer explicit item labels and keep
  // quantity at one when a product is named but no quantity is printed.
  const productMatches = [
    flat.match(/(?:product(?:\s+name)?|item(?:\s+description)?|description)\s*[:\-]\s*([^,;|]+?)(?=\s+(?:qty|quantity|price|amount|sku)\b|[,;|]|$)/i),
    flat.match(/(?:sold item|item name)\s*[:\-]?\s*([^,;|]+?)(?=\s+(?:qty|quantity|price|amount)\b|[,;|]|$)/i)
  ];
  const productName = cleanProductName(productMatches.find(match => match)?.[1]);
  const quantityMatch = flat.match(/(?:qty|quantity)\s*[:\-]?\s*(\d{1,4})\b/i);
  const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : (productName ? 1 : null);

  // Date — supports DD.MM.YYYY (Meesho), DD/MM/YYYY, and DD-MM-YYYY.
  const dateMatch = flat.match(/\b(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4})\b/);
  const timeMatch = flat.match(/\b(\d{1,2}:\d{2}\s?(?:AM|PM)?)\b/i);

  const state = pinToState(pin);

  return {
    orderId: orderId || ('EST-' + Math.random().toString(36).slice(2, 9).toUpperCase()),
    orderIdSource: orderId ? 'label text' : 'not found',
    paymentType,
    paymentMethod,
    amount: amount || null,
    pin,
    state,
    city: billCity || 'Unknown',
    customerName,
    gender: estimateGender(customerName),
    productName,
    quantity,
    category: classifyProduct(productName),
    date: dateMatch ? dateMatch[1] : null,
    time: timeMatch ? timeMatch[1] : null,
    rawTextLength: text.length,
  };
}

// ---- QR / barcode decoding ----
// Every marketplace label carries a QR or 1D barcode that encodes the
// order/tracking number directly — reading it is more reliable than
// regex-matching an order ID out of surrounding text, especially on
// unusual or unfamiliar label layouts. Requires jsQR (loaded in app.html).
function decodeQrFromCanvas(canvas) {
  if (typeof jsQR === 'undefined') return null;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result ? result.data : null;
}

// ---- PDF -> text (+ raster fallback for scanned/image PDFs, + QR decode) ----
// One PDF can contain multiple sub-order labels (common for Meesho bulk
// label downloads) — each page is parsed and returned as a separate record.
async function parsePdfFile(file, { onOcrStart } = {}) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const results = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    let text = textContent.items.map(i => i.str).join('\n');

    let ocrUsed = false;
    let canvas = null;
    const needsRender = text.trim().length < 25; // likely scanned/image PDF

    if (needsRender && typeof Tesseract !== 'undefined') {
      ocrUsed = true;
      if (onOcrStart) onOcrStart(pageNum, pdf.numPages);
      const viewport = page.getViewport({ scale: 2 });
      canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const { data: { text: ocrText } } = await Tesseract.recognize(canvas, 'eng');
      text = ocrText;
    }

    const marketplace = detectMarketplace(text);
    const fields = extractFields(text);

    // Cross-check the order ID against the label's QR/barcode when the
    // text-based regex didn't find one — render the page only if we
    // haven't already (OCR above may have rendered it).
    if (!canvas && fields.orderIdSource === 'not found') {
      try {
        const viewport = page.getViewport({ scale: 1.5 });
        canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      } catch (e) { canvas = null; }
    }
    if (canvas) {
      const qrValue = decodeQrFromCanvas(canvas);
      if (qrValue && fields.orderIdSource === 'not found') {
        fields.orderId = qrValue;
        fields.orderIdSource = 'QR/barcode';
      }
    }

    results.push({ marketplace, fields, ocrUsed, pageNum });
  }

  return { pages: results, pageCount: pdf.numPages };
}
