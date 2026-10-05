// Recognizes merchants locally from their description: a known brand gets its
// logo; otherwise a keyword picks the kind of place. Nothing leaves the device.
const BRANDS: [RegExp, string][] = [
  [/american express|\bamex\b/, 'americanexpress'],
  [/bank of america|\bbofa\b/, 'bankofamerica'],
  [/starbucks/, 'starbucks'],
  [/mc ?donald/, 'mcdonalds'],
  [/burger king/, 'burgerking'],
  [/\bkfc\b|kentucky fried/, 'kfc'],
  [/taco bell/, 'tacobell'],
  [/uber ?eats/, 'ubereats'],
  [/door ?dash/, 'doordash'],
  [/instacart/, 'instacart'],
  [/deliveroo/, 'deliveroo'],
  [/hello ?fresh/, 'hellofresh'],
  [/\btarget\b/, 'target'],
  [/\bmacy'?s\b/, 'macys'],
  [/\bebay\b/, 'ebay'],
  [/\betsy\b/, 'etsy'],
  [/\bzara\b/, 'zara'],
  [/uniqlo/, 'uniqlo'],
  [/\bh ?& ?m\b|hennes/, 'handm'],
  [/\bnike\b/, 'nike'],
  [/adidas/, 'adidas'],
  [/\bikea\b/, 'ikea'],
  [/\blidl\b/, 'lidl'],
  [/\baldi\b/, 'aldinord'],
  [/\buber\b/, 'uber'],
  [/\blyft\b/, 'lyft'],
  [/\bshell\b/, 'shell'],
  [/delta air/, 'delta'],
  [/american airlines/, 'americanairlines'],
  [/southwest/, 'southwestairlines'],
  [/airbnb/, 'airbnb'],
  [/marriott/, 'marriott'],
  [/hilton/, 'hilton'],
  [/netflix/, 'netflix'],
  [/spotify/, 'spotify'],
  [/youtube/, 'youtube'],
  [/apple music/, 'applemusic'],
  [/\bapple\b|itunes|app store/, 'apple'],
  [/audible/, 'audible'],
  [/twitch/, 'twitch'],
  [/\bhbo\b|\bmax\.com\b/, 'hbomax'],
  [/paramount/, 'paramountplus'],
  [/playstation|\bpsn\b/, 'playstation'],
  [/\bsteam(games|powered)?\b/, 'steam'],
  [/peloton/, 'peloton'],
  [/venmo/, 'venmo'],
  [/zelle/, 'zelle'],
  [/paypal/, 'paypal'],
  [/cash ?app|square cash/, 'cashapp'],
  [/\bat ?& ?t\b/, 'atandt'],
  [/spectrum/, 'spectrum'],
  [/google/, 'google'],
  [/icloud/, 'icloud'],
  [/dropbox/, 'dropbox'],
  [/notion/, 'notion'],
  [/github/, 'github'],
  [/claude|anthropic/, 'claude'],
];
export type MerchantKind =
  | 'coffee'
  | 'bakery'
  | 'dessert'
  | 'pizza'
  | 'fastfood'
  | 'asian'
  | 'healthy'
  | 'bar'
  | 'delivery'
  | 'grocery'
  | 'restaurant'
  | 'convenience'
  | 'rideshare'
  | 'transit'
  | 'fuel'
  | 'parking'
  | 'pharmacy'
  | 'medical'
  | 'housing'
  | 'internet'
  | 'power'
  | 'streaming'
  | 'gym'
  | 'travel'
  | 'hotel'
  | 'clothing'
  | 'pets'
  | 'income'
  | 'reimbursement'
  | 'cardpayment'
  | 'return';
// Order matters: the first match wins.
const KINDS: [RegExp, MerchantKind][] = [
  [/reimburse/, 'reimbursement'],
  [/\b(return|refund)\b/, 'return'],
  [/card payment|autopay|credit card pmt|payment thank/, 'cardpayment'],
  [/salary|payroll|paycheck|direct dep/, 'income'],
  [/grubhub|seamless|postmates|caviar|delivery/, 'delivery'],
  [/coffee|caf[eé]|espresso|latte|roaster|\btea\b|boba|bubble tea/, 'coffee'],
  [/bakery|bakehouse|donut|doughnut|bagel|patisserie|croissant/, 'bakery'],
  [/ice cream|gelato|froyo|dessert|creamery|sweets/, 'dessert'],
  [/pizz/, 'pizza'],
  [/burger|fries|wings|fried chicken|drive.?thru|hot dog|chick/, 'fastfood'],
  [/sushi|ramen|noodle|\bpho\b|thai|wok|dumpling|poke|teriyaki|curry/, 'asian'],
  [/salad|juice|smoothie|acai|bowl\b|greens/, 'healthy'],
  [
    /\bbar\b|\bpub\b|brew|tavern|taproom|winery|wine|liquor|spirits|lounge/,
    'bar',
  ],
  [
    /market|grocer|supermarket|foods\b|trader joe|whole foods|kroger|safeway|publix|wegmans|costco|walmart|h-?e-?b\b/,
    'grocery',
  ],
  [
    /restaurant|kitchen|bistro|eatery|dinner|lunch|brunch|diner|taqueria|tacos?\b|steakhouse|bbq|grill/,
    'restaurant',
  ],
  [
    /7-?eleven|bodega|\bdeli\b|convenience|wawa|sheetz|neighborhood store/,
    'convenience',
  ],
  [/\btaxi\b|\bcab\b|rideshare/, 'rideshare'],
  [
    /metro|subway|transit|\bmta\b|\bbus\b|train|amtrak|\brail|ferry|omny/,
    'transit',
  ],
  [/\bgas\b|fuel|exxon|chevron|\bbp\b|sunoco|mobil|citgo|speedway/, 'fuel'],
  [/parking|garage/, 'parking'],
  [/pharmacy|\bcvs\b|walgreens|rite aid|drugstore/, 'pharmacy'],
  [
    /doctor|clinic|dental|dentist|hospital|medical|urgent care|optometr/,
    'medical',
  ],
  [/\brent\b|apartment|landlord|mortgage|hoa\b/, 'housing'],
  [/internet|wi-?fi|comcast|xfinity|verizon|t-?mobile|phone bill/, 'internet'],
  [/electric|con ?ed|utility|water bill|power/, 'power'],
  [/streaming|hulu|disney|prime video|peacock/, 'streaming'],
  [/\bgym\b|fitness|yoga|pilates|equinox|crossfit/, 'gym'],
  [/airline|airways|flight|airport/, 'travel'],
  [/hotel|\binn\b|motel|resort/, 'hotel'],
  [/apparel|clothing|boutique|shoes|outfitters/, 'clothing'],
  [/\bpet|vet\b|veterinar|chewy|petco|petsmart/, 'pets'],
];
const clean = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();
export function merchantBrand(name: string): string | null {
  const text = clean(name);
  return BRANDS.find(([re]) => re.test(text))?.[1] ?? null;
}
export function merchantKind(name: string): MerchantKind | null {
  const text = clean(name);
  return KINDS.find(([re]) => re.test(text))?.[1] ?? null;
}
