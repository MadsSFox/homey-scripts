# Homey Scripts

Automation scripts for [Athom Homey](https://homey.app/) smart home controllers, designed to be called from Homey Flows using the [HomeyScript](https://homey.app/en-dk/app/com.athom.homeyscript/HomeyScript/) app.

## What is HomeyScript?

HomeyScript is an app for Athom Homey that lets you run JavaScript code directly on your Homey. Scripts can be triggered from Flows, allowing you to create advanced automations that go beyond the standard Flow cards.

**To use these scripts:**
1. Install the [HomeyScript app](https://homey.app/en-dk/app/com.athom.homeyscript/HomeyScript/) on your Homey
2. Create a new script and paste the code
3. Create a Flow that triggers the script (e.g., every hour, at specific times, or based on events)

---

## cheapestHours.js

Finds the cheapest electricity window in Denmark by calculating the **true total price** including all tariffs and taxes.

### Features

- **Real-time pricing**: Fetches live data from [Energi Data Service](https://www.energidataservice.dk/)
- **Complete cost calculation**: Includes spot price + grid tariff + system tariff + transmission tariff + electricity tax + VAT
- **Time-of-use tariffs**: Automatically handles hourly grid tariff variations
- **Configurable window**: Find cheapest 1, 2, 3, or more consecutive hours
- **Homey integration**: Updates Logic variables for use in other Flows
- **Danish notifications**: Sends actionable messages to your Homey

### Price Components

The script fetches all tariffs dynamically from Energi Data Service:

| Component | API Filter | Updates |
|-----------|------------|---------|
| Spot price | `Elspotprices` | Hourly |
| Grid tariff (nettarif) | `DatahubPricelist` + your GLN | When changed |
| System tariff | `ChargeTypeCode: 40000` | Quarterly |
| Transmission tariff | `ChargeTypeCode: 41000` | Quarterly |
| Electricity tax | `ChargeTypeCode: EA-001` | Yearly |

### Setup

#### 1. Create Homey Variables

In the Homey app, go to **Logic** and create these variables:

| Variable | Type | Description |
|----------|------|-------------|
| `HoursToCheapest` | Number | Hours until cheapest window starts |
| `CheapestPrice` | Number | Average price in cheapest window (DKK/kWh) |
| `CurrentPrice` | Number | Current hour's total price (DKK/kWh) |

#### 2. Create the Script

1. Open the HomeyScript app
2. Create a new script named `cheapestHours`
3. Paste the contents of `cheapestHours.js`

#### 3. Create a Flow to Run the Script

Example Flow to run every hour:
- **When**: Every hour (use the "Date & Time" app)
- **Then**: Run HomeyScript `cheapestHours` with argument `DK2, 3, 5790000705689`

### Usage

Run from a Flow with arguments:

```
priceArea, windowSize, gridCompanyGLN
```

**Examples:**
- `DK2, 3, 5790000705689` - Copenhagen area, 3-hour window, Radius Elnet
- `DK1, 2, 5790001089030` - Western Denmark, 2-hour window, N1

**Default values (if no arguments provided):**
- Price area: `DK2` (Eastern Denmark)
- Window size: `3` hours
- Grid company: `5790000705689` (Radius Elnet)

### Find Your Grid Company GLN

You can find your grid company (netselskab) on your electricity bill or here:
- https://greenpowerdenmark.dk/LeveringsstedID (enter your address)

**Common GLNs:**

| Company | Area | GLN |
|---------|------|-----|
| **Radius Elnet** | København, Nordsjælland | `5790000705689` |
| Cerius | Sydsjælland | `5790000392261` |
| N1 | Nordjylland, Midtjylland | `5790001089030` |
| TREFOR El-net | Trekantområdet | `5790000706686` |
| Vores Elnet | Fyn | `5790000610976` |
| Konstant | Vestjylland | `5790000704842` |
| Dinel | Sønderjylland | `5790000681075` |

### Example Output

When the cheapest window is now:
```
⚡ NU er billigst! Gns. 1.85 DKK/kWh
```

When you should wait:
```
⏳ Vent 4t — billigst kl. 14:00 (1.52 DKK). Nu: 2.34 DKK
```

### Flow Ideas

Use the variables updated by this script to create smart automations:

- **Start appliances**: When `HoursToCheapest = 0`, turn on dishwasher/washing machine
- **EV charging**: Start charging when `HoursToCheapest = 0`, stop when window ends
- **Water heating**: Heat water tank when `CurrentPrice` is below threshold
- **Price alerts**: Send push notification when `CurrentPrice` exceeds a limit
- **Display**: Show `CurrentPrice` on a smart display or LED indicator

---

## License

MIT
