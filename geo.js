/* Approximate places for the directory's region filter (T62): known cities and German postcode areas.
   Coordinates are city centres or postcode-area centres, good enough for "within 100 km", not for routing. */
const CITIES = {
  augsburg: [48.37, 10.9],
  munich: [48.137, 11.576],
  munchen: [48.137, 11.576],
  stuttgart: [48.775, 9.182],
  nuremberg: [49.452, 11.077],
  nurnberg: [49.452, 11.077],
  regensburg: [49.013, 12.102],
  ingolstadt: [48.766, 11.425],
  ulm: [48.401, 9.987],
  dresden: [51.05, 13.738],
  leipzig: [51.34, 12.375],
  chemnitz: [50.833, 12.925],
  berlin: [52.52, 13.405],
  hamburg: [53.551, 9.993],
  bremen: [53.079, 8.802],
  hannover: [52.375, 9.732],
  hanover: [52.375, 9.732],
  wolfsburg: [52.423, 10.787],
  frankfurt: [50.11, 8.682],
  cologne: [50.938, 6.96],
  koln: [50.938, 6.96],
  dusseldorf: [51.227, 6.773],
  dortmund: [51.514, 7.468],
  essen: [51.456, 7.012],
  karlsruhe: [49.007, 8.404],
  mannheim: [49.488, 8.466],
  wurzburg: [49.791, 9.953],
  erfurt: [50.978, 11.029],
  prague: [50.075, 14.438],
  brno: [49.195, 16.608],
  vienna: [48.208, 16.373],
  wien: [48.208, 16.373],
  linz: [48.306, 14.286],
  salzburg: [47.809, 13.055],
  graz: [47.071, 15.439],
  zurich: [47.377, 8.541],
  poznan: [52.406, 16.925],
  warsaw: [52.23, 21.012],
  turin: [45.07, 7.687],
  milan: [45.464, 9.19],
  barcelona: [41.387, 2.168],
  lyon: [45.764, 4.835],
  paris: [48.857, 2.352],
  eindhoven: [51.441, 5.469],
  amsterdam: [52.368, 4.904],
  detroit: [42.331, -83.046],
  monterrey: [25.686, -100.316],
  "san luis potosi": [22.157, -100.986],
  istanbul: [41.008, 28.978],
  amman: [31.953, 35.91],
  dubai: [25.205, 55.271],
  cairo: [30.044, 31.236],
  "cluj-napoca": [46.771, 23.624],
  cluj: [46.771, 23.624],
};
// German postcode areas (first two digits); the first digit is the fallback.
const POSTCODES = {
  "01": [51.05, 13.74],
  "04": [51.34, 12.37],
  "06": [51.48, 11.97],
  "07": [50.9, 11.6],
  "09": [50.83, 12.92],
  10: [52.52, 13.4],
  12: [52.45, 13.45],
  13: [52.56, 13.33],
  14: [52.39, 13.06],
  18: [54.09, 12.1],
  19: [53.63, 11.41],
  20: [53.55, 10.0],
  21: [53.5, 10.1],
  22: [53.6, 10.0],
  24: [54.32, 10.13],
  28: [53.08, 8.8],
  30: [52.37, 9.73],
  33: [52.02, 8.53],
  34: [51.31, 9.48],
  38: [52.26, 10.52],
  39: [52.13, 11.62],
  40: [51.23, 6.78],
  44: [51.51, 7.47],
  45: [51.46, 7.01],
  47: [51.43, 6.76],
  48: [51.96, 7.63],
  50: [50.94, 6.96],
  51: [50.95, 7.05],
  53: [50.73, 7.1],
  55: [50.0, 8.27],
  60: [50.11, 8.68],
  61: [50.2, 8.6],
  64: [49.87, 8.65],
  65: [50.08, 8.24],
  66: [49.24, 7.0],
  67: [49.48, 8.44],
  68: [49.49, 8.47],
  69: [49.4, 8.67],
  70: [48.78, 9.18],
  71: [48.8, 9.1],
  72: [48.5, 9.1],
  73: [48.7, 9.6],
  76: [49.0, 8.4],
  79: [48.0, 7.85],
  80: [48.14, 11.58],
  81: [48.12, 11.6],
  82: [48.0, 11.3],
  83: [47.86, 12.12],
  84: [48.54, 12.15],
  85: [48.6, 11.6],
  86: [48.37, 10.9],
  87: [47.73, 10.31],
  88: [47.78, 9.61],
  89: [48.4, 9.99],
  90: [49.45, 11.08],
  91: [49.6, 11.0],
  92: [49.45, 11.86],
  93: [49.01, 12.1],
  94: [48.57, 13.43],
  95: [50.0, 11.6],
  96: [49.9, 10.9],
  97: [49.79, 9.95],
  98: [50.6, 10.7],
  99: [50.98, 11.03],
  0: [51.1, 12.9],
  1: [52.6, 13.3],
  2: [53.5, 9.8],
  3: [52.0, 9.9],
  4: [51.5, 7.2],
  5: [50.6, 7.2],
  6: [50.0, 8.5],
  7: [48.6, 8.9],
  8: [48.0, 11.4],
  9: [49.6, 11.2],
};

const plain = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .trim();

// "Munich", "München, Germany" or "93055" → [lat, lon]; null when the place is unknown.
function geocode(text) {
  const s = plain(text);
  if (!s) return null;
  const zip = s.match(/\b(\d{5})\b/);
  if (zip) return POSTCODES[zip[1].slice(0, 2)] || POSTCODES[zip[1][0]] || null;
  const names = Object.keys(CITIES).sort((a, b) => b.length - a.length);
  const hit = names.find((n) => new RegExp(`(^|[^a-z])${n.replace(/[-]/g, "\\-")}([^a-z]|$)`).test(s));
  return hit ? CITIES[hit] : null;
}

function distanceKm([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180,
    dLat = (lat2 - lat1) * rad,
    dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

module.exports = { geocode, distanceKm };
