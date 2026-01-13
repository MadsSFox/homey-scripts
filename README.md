# Homey Scripts

Collection of [HomeyScript](https://homey.app/en-dk/app/com.athom.homeyscript/HomeyScript/) automation scripts for Athom Homey smart home controllers.

## cheapestHours.js

Finds the cheapest electricity window in Denmark by calculating the **true total price** including all tariffs and taxes.

### Features

- **Real-time pricing**: Fetches live data from [Energi Data Service](https://www.energidataservice.dk/)
- **Complete cost calculation**: Includes spot price + grid tariff + system tariff + transmission tariff + electricity tax + VAT
- **Time-of-use tariffs**: Automatically handles hourly grid tariff variations
- **Configurable window**: Find cheapest 1, 2, 3, or more consecutive hours
- **Homey integration**: Updates variables for use in flows
- **Danish notifications**: Sends actionable messages

### Price Components

The script fetches all tariffs dynamically from Energi Data Service:

| Component | API Filter | Updates |
|-----------|------------|---------|
| Spot price | `Elspotprices` | Hourly |
| Grid tariff (nettarif) | `DatahubPricelist` + your GLN | When changed |
| System tariff | `ChargeTypeCode: 40000` | Quarterly |
| Transmission tariff | `ChargeTypeCode: 41000` | Quarterly |
| Electricity tax | `ChargeTypeCode: EA-001` | Yearly |

### Usage

Run from HomeyScript with arguments:

```
priceArea, windowSize, gridCompanyGLN
```

**Examples:**
- `DK2, 3, 5790000705689` - Copenhagen area, 3-hour window, Radius Elnet
- `DK1, 2, 5790001089030` - Western Denmark, 2-hour window, N1

**Default values:**
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

### Homey Variables

Create these variables in Homey Logic for the script to update:

| Variable | Type | Description |
|----------|------|-------------|
| `HoursToCheapest` | Number | Hours until cheapest window starts |
| `CheapestPrice` | Number | Average price in cheapest window (DKK/kWh) |
| `CurrentPrice` | Number | Current hour's total price (DKK/kWh) |

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

- Start dishwasher/washing machine when `HoursToCheapest = 0`
- Charge EV during cheapest window
- Heat water tank when prices are low
- Send notification when current price exceeds threshold

## License

MIT
