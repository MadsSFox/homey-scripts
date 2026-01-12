const windowSize = args[0] ? parseInt(args[0]) : 3;
const priceArea = args[1] ? args[1] : "DK2"

// Fetch DK2 electricity prices for the next 24+ hours
const now = new Date();
const startTime = now.toISOString().slice(0, 13) + ':00'; // Current hour

const url = `https://api.energidataservice.dk/dataset/DayAheadPrices?filter={"PriceArea":"${priceArea}"}&sort=TimeDK%20asc&limit=24`;

const response = await fetch(url);
const data = await response.json();

// Filter to only future hours and take first 24
const prices = data.records
  .slice(0, 24)
  .map((r, i) => ({
    hoursFromNow: i,
    hour: new Date(r.TimeDK).getHours(),
    price: r.DayAheadPriceDKK / 1000, // Convert øre to DKK/kWh
    time: r.TimeDK
  }));

if (prices.length < 3) {
  return "Not enough price data available yet";
}

// Find average price for each 3-hour window
const windows = [];
for (let start = 0; start <= prices.length - 3; start++) {
  const windowPrices = prices.slice(start, start + 3);
  const avg = windowPrices.reduce((sum, h) => sum + h.price, 0) / 3;
  windows.push({
    startsInHours: start,
    startHour: windowPrices[0].hour,
    avgPrice: avg
  });
}

// Find the cheapest 3-hour window
const cheapest = windows.reduce((min, w) => w.avgPrice < min.avgPrice ? w : min);

// Store values in homey variables
const variables = await Homey.logic.getVariables();

const priceVar = Object.values(variables).find(v => v.name === 'CheapestPrice');
const startHourVar = Object.values(variables).find(v => v.name === 'CheapestStartHour');

if (priceVar) {
  await Homey.logic.updateVariable({ id: priceVar.id, variable: { value: cheapest.avgPrice } });
} else {
  await Homey.logic.createVariable({variable: {name: "CheapestPrice", type: "number", value: cheapest.avgPrice}});
}
if (startHourVar) {
  await Homey.logic.updateVariable({ id: startHourVar.id, variable: { value: cheapest.startHour } });
} else {
  await Homey.logic.createVariable({variable: {name: "CheapestStartHour", type: "number", value: cheapest.startHour}});
}

// Build message
let message;
if (cheapest.startsInHours === 0) {
  message = `⚡ NU er billigst! De næste 3 timer koster gns. ${cheapest.avgPrice.toFixed(2)} DKK/kWh`;
} else {
  const startTime = `${cheapest.startHour.toString().padStart(2, '0')}:00`;
  message = `⏳ Vent ${cheapest.startsInHours} timer — billigste 3-timers vindue starter kl. ${startTime} (gns. ${cheapest.avgPrice.toFixed(2)} DKK/kWh)`;
}

// Send notification

console.log(message);
// Return true if NOW is the cheapest window
return cheapest.startsInHours === 0;
