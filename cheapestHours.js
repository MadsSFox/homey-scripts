// === CONFIGURATION ===
const windowSize = args[0] ? parseInt(args[1]) : 3;
const priceArea = args[1] || 'DK2';
const gridCompanyGLN = args[2] || '5790000705689';  // Radius Elnet (Copenhagen)
const priceType = args[3] || 'total';  // 'total', 'spot', or 'grid'
const includeVAT = true;
const vatRate = 0.25;

// === PRICE TYPE OPTIONS ===
// 'total' - Optimize for total price (spot + grid + fixed tariffs + VAT)
// 'spot'  - Optimize for spot price only (variable market price)
// 'grid'  - Optimize for grid tariff only (time-of-use network fee)

// === COMMON GRID COMPANY GLNs ===
// Radius Elnet (København, Nordsjælland): 5790000705689
// N1 (Nordjylland, Midtjylland): 5790001089030
// TREFOR El-net (Trekantområdet): 5790000706686
// Vores Elnet (Fyn): 5790000610976
// Konstant (Vestjylland): 5790000704842
// Dinel (Sønderjylland): 5790000681075
// Find yours at: https://elnet.dk/nettilslutning/find-netselskab

const now = new Date();
const currentHour = now.getHours();
const currentMonth = now.getMonth() + 1;
const today = now.toISOString().split('T')[0];

// === 1. FETCH SPOT PRICES (DayAheadPrices replaces discontinued Elspotprices) ===
const spotUrl = `https://api.energidataservice.dk/dataset/DayAheadPrices?filter={"PriceArea":"${priceArea}"}&start=${now.toISOString().slice(0, 13)}:00&sort=TimeDK%20asc&limit=48`;
const spotResponse = await fetch(spotUrl);
const spotData = await spotResponse.json();

// === 2. FETCH GRID TARIFFS (Nettarif C = residential time-of-use tariff) ===
const gridUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"GLN_Number":"${gridCompanyGLN}","Note":"Nettarif C"}&sort=ValidFrom%20desc&limit=5`;
const gridResponse = await fetch(gridUrl);
const gridData = await gridResponse.json();

// Find the currently valid grid tariff
const validGridTariff = gridData.records.find(r => {
  const validFrom = new Date(r.ValidFrom);
  const validTo = r.ValidTo ? new Date(r.ValidTo) : new Date('2099-12-31');
  return now >= validFrom && now <= validTo;
});

// === 3. FETCH SYSTEM TARIFF (Energinet - 41000 = Systemtarif) ===
const systemUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"GLN_Number":"5790000432752","ChargeTypeCode":"41000"}&sort=ValidFrom%20desc&limit=1`;
const systemResponse = await fetch(systemUrl);
const systemData = await systemResponse.json();
const systemTariff = systemData.records[0]?.Price1 || 0.054;

// === 4. FETCH TRANSMISSION TARIFF (Energinet - 40000 = Transmissions nettarif) ===
const transUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"GLN_Number":"5790000432752","ChargeTypeCode":"40000"}&sort=ValidFrom%20desc&limit=1`;
const transResponse = await fetch(transUrl);
const transData = await transResponse.json();
const transmissionTariff = transData.records[0]?.Price1 || 0.049;

// === 5. FETCH ELECTRICITY TAX (Energinet - EA-001 = Elafgift) ===
const taxUrl = `https://api.energidataservice.dk/dataset/DatahubPricelist?filter={"GLN_Number":"5790000432752","ChargeTypeCode":"EA-001"}&sort=ValidFrom%20desc&limit=1`;
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
  .filter(r => new Date(r.TimeDK) >= now)
  .slice(0, 24)
  .map((r, i) => {
    const hourDate = new Date(r.TimeDK);
    const hour = hourDate.getHours();

    // Spot price in DKK/kWh (DayAheadPriceDKK is in DKK/MWh, divide by 1000)
    let spotPrice = r.DayAheadPriceDKK / 1000;

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
      time: r.TimeDK
    };
  });

if (prices.length < windowSize) {
  return `Not enough data for ${windowSize}-hour window`;
}

// === FIND CHEAPEST WINDOW ===
// Helper to get the price to compare based on priceType setting
function getComparePrice(item) {
  switch (priceType) {
    case 'spot': return item.spotPrice || item.avgSpotPrice;
    case 'grid': return item.gridTariff || item.avgGridTariff;
    default: return item.totalPrice || item.avgPrice;
  }
}

const windows = [];
for (let start = 0; start <= prices.length - windowSize; start++) {
  const windowPrices = prices.slice(start, start + windowSize);
  const avgTotal = windowPrices.reduce((sum, h) => sum + h.totalPrice, 0) / windowSize;
  const avgSpot = windowPrices.reduce((sum, h) => sum + h.spotPrice, 0) / windowSize;
  const avgGrid = windowPrices.reduce((sum, h) => sum + h.gridTariff, 0) / windowSize;
  windows.push({
    startsInHours: start,
    startHour: windowPrices[0].hour,
    avgPrice: avgTotal,
    avgSpotPrice: avgSpot,
    avgGridTariff: avgGrid
  });
}

// Find cheapest window based on selected price type
const cheapest = windows.reduce((min, w) => getComparePrice(w) < getComparePrice(min) ? w : min);

// Calculate fixed tariffs total (for variable storage)
const fixedTariffsTotal = systemTariff + transmissionTariff + electricityTax;

// Helper function to update a variable by name
async function updateVar(name, value) {
  // === STORE IN VARIABLES ===
  const variables = await Homey.logic.getVariables();
  const v = Object.values(variables).find(v => v.name === name);
  if (v) {
    await Homey.logic.updateVariable({ id: v.id, variable: { value: Math.round(value * 100) / 100 } });
  } else {
    await Homey.logic.createVariable({ variable: { name: name, type: "number", value: Math.round(value * 100) / 100 } });
  }
}

// Cheapest window variables
await updateVar('HoursToCheapest', cheapest.startsInHours);
await updateVar('CheapestTotalPrice', cheapest.avgPrice);
await updateVar('CheapestSpotPrice', cheapest.avgSpotPrice);
await updateVar('CheapestGridTariff', cheapest.avgGridTariff);

// Current hour variables
if (prices.length > 0) {
  await updateVar('CurrentTotalPrice', prices[0].totalPrice);
  await updateVar('CurrentSpotPrice', prices[0].spotPrice);
  await updateVar('CurrentGridTariff', prices[0].gridTariff);
}

// Fixed tariffs (same for all hours)
await updateVar('FixedTariffs', fixedTariffsTotal);

// === BUILD MESSAGE ===
const currentPrice = prices[0].totalPrice.toFixed(2);
let message;

if (cheapest.startsInHours === 0) {
  message = `⚡ NU er billigst! Gns. ${cheapest.avgPrice.toFixed(2)} DKK/kWh`;
} else {
  const startTime = `${cheapest.startHour.toString().padStart(2, '0')}:00`;
  message = `⏳ Vent ${cheapest.startsInHours}t — billigst kl. ${startTime} (${cheapest.avgPrice.toFixed(2)} DKK). Nu: ${currentPrice} DKK`;
}

// Note: Use a Flow to send notifications based on HoursToCheapest or the return value

// Debug info
console.log('Price type:', priceType);
console.log('Grid company GLN:', gridCompanyGLN);
console.log('Grid tariff source:', validGridTariff?.ChargeOwner || 'Fallback');
console.log('Current hour breakdown:', prices[0]);
console.log(message);

// Return true if NOW is the cheapest window
return cheapest.startsInHours === 0;
