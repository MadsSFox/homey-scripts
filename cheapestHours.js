// === CONFIGURATION ===
const priceArea = args[0] || 'DK2';
const windowSize = args[1] ? parseInt(args[1]) : 3;
const gridCompanyGLN = args[2] || '5790000705689';  // Radius Elnet (Copenhagen)
const includeVAT = true;
const vatRate = 0.25;

// === COMMON GRID COMPANY GLNs ===
// Radius Elnet (København, Nordsjælland): 5790000705689
// Cerius (Sydsjælland): 5790000392261
// N1 (Nordjylland, Midtjylland): 5790001089030
// TREFOR El-net (Trekantområdet): 5790000706686
// Vores Elnet (Fyn): 5790000610976
// Konstant (Vestjylland): 5790000704842
// Dinel (Sønderjylland): 5790000681075
// Find yours at: https://greenpowerdenmark.dk/LeveringsstedID

const now = new Date();
const currentHour = now.getHours();
const currentMonth = now.getMonth() + 1;
const today = now.toISOString().split('T')[0];

// === 1. FETCH SPOT PRICES ===
const spotUrl = `https://api.energidataservice.dk/dataset/Elspotprices?filter={"PriceArea":"${priceArea}"}&start=${now.toISOString().slice(0, 13)}:00&sort=HourDK%20asc&limit=48`;
const spotResponse = await fetch(spotUrl);
const spotData = await spotResponse.json();

// === 2. FETCH GRID TARIFFS (ChargeType CD = nettarif C time-differentiated) ===
const gridUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"ChargeOwner":"${gridCompanyGLN}","ChargeType":"D03"}&sort=ValidFrom%20desc&limit=5`;
const gridResponse = await fetch(gridUrl);
const gridData = await gridResponse.json();

// Find the currently valid grid tariff
const validGridTariff = gridData.records.find(r => {
  const validFrom = new Date(r.ValidFrom);
  const validTo = r.ValidTo ? new Date(r.ValidTo) : new Date('2099-12-31');
  return now >= validFrom && now <= validTo;
});

// === 3. FETCH SYSTEM TARIFF (Energinet) ===
const systemUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"ChargeOwner":"5790000432752","ChargeTypeCode":"40000"}&sort=ValidFrom%20desc&limit=1`;
const systemResponse = await fetch(systemUrl);
const systemData = await systemResponse.json();
const systemTariff = systemData.records[0]?.Price1 || 0.054;

// === 4. FETCH TRANSMISSION TARIFF (Energinet) ===
const transUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"ChargeOwner":"5790000432752","ChargeTypeCode":"41000"}&sort=ValidFrom%20desc&limit=1`;
const transResponse = await fetch(transUrl);
const transData = await transResponse.json();
const transmissionTariff = transData.records[0]?.Price1 || 0.049;

// === 5. FETCH ELECTRICITY TAX ===
const taxUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"ChargeOwner":"5790000432752","ChargeTypeCode":"EA-001"}&sort=ValidFrom%20desc&limit=1`;
const taxResponse = await fetch(taxUrl);
const taxData = await taxResponse.json();
const electricityTax = taxData.records[0]?.Price1 || 0.761;

// === HELPER: Get grid tariff for specific hour ===
function getGridTariffForHour(hour) {
  if (!validGridTariff) return 0.5; // Fallback
  const priceKey = `Price${hour + 1}`;
  return validGridTariff[priceKey] || validGridTariff.Price1 || 0.5;
}

// === BUILD PRICE ARRAY ===
const prices = spotData.records
  .filter(r => new Date(r.HourDK) >= now)
  .slice(0, 24)
  .map((r, i) => {
    const hourDate = new Date(r.HourDK);
    const hour = hourDate.getHours();

    // Spot price in DKK/kWh
    let spotPrice = r.SpotPriceDKK / 1000;

    // Grid tariff (time-of-use from API)
    const gridTariff = getGridTariffForHour(hour);

    // Fixed tariffs
    const fixedTariffs = systemTariff + transmissionTariff + electricityTax;

    // Total before VAT
    let totalExVat = spotPrice + gridTariff + fixedTariffs;

    // Add VAT if configured
    const totalPrice = includeVAT ? totalExVat * (1 + vatRate) : totalExVat;

    return {
      hoursFromNow: i,
      hour: hour,
      spotPrice: spotPrice,
      gridTariff: gridTariff,
      totalPrice: totalPrice,
      time: r.HourDK
    };
  });

if (prices.length < windowSize) {
  return `Not enough data for ${windowSize}-hour window`;
}

// === FIND CHEAPEST WINDOW ===
const windows = [];
for (let start = 0; start <= prices.length - windowSize; start++) {
  const windowPrices = prices.slice(start, start + windowSize);
  const avgTotal = windowPrices.reduce((sum, h) => sum + h.totalPrice, 0) / windowSize;
  windows.push({
    startsInHours: start,
    startHour: windowPrices[0].hour,
    avgPrice: avgTotal
  });
}

const cheapest = windows.reduce((min, w) => w.avgPrice < min.avgPrice ? w : min);

// === STORE IN VARIABLES ===
const variables = await Homey.logic.getVariables();

const hoursVar = Object.values(variables).find(v => v.name === 'HoursToCheapest');
if (hoursVar) {
  await Homey.logic.updateVariable({ id: hoursVar.id, variable: { value: cheapest.startsInHours } });
}

const priceVar = Object.values(variables).find(v => v.name === 'CheapestPrice');
if (priceVar) {
  await Homey.logic.updateVariable({ id: priceVar.id, variable: { value: Math.round(cheapest.avgPrice * 100) / 100 } });
}

const currentVar = Object.values(variables).find(v => v.name === 'CurrentPrice');
if (currentVar && prices.length > 0) {
  await Homey.logic.updateVariable({ id: currentVar.id, variable: { value: Math.round(prices[0].totalPrice * 100) / 100 } });
}

// === BUILD MESSAGE ===
const currentPrice = prices[0].totalPrice.toFixed(2);
let message;

if (cheapest.startsInHours === 0) {
  message = `⚡ NU er billigst! Gns. ${cheapest.avgPrice.toFixed(2)} DKK/kWh`;
} else {
  const startTime = `${cheapest.startHour.toString().padStart(2, '0')}:00`;
  message = `⏳ Vent ${cheapest.startsInHours}t — billigst kl. ${startTime} (${cheapest.avgPrice.toFixed(2)} DKK). Nu: ${currentPrice} DKK`;
}

await Homey.notifications.createNotification({ excerpt: message });

// Debug info
console.log('Grid company GLN:', gridCompanyGLN);
console.log('Grid tariff source:', validGridTariff?.ChargeOwner || 'Fallback');
console.log('Current hour breakdown:', prices[0]);
console.log(message);

// Return true if NOW is the cheapest window
return cheapest.startsInHours === 0;
