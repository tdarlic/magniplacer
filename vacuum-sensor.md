# Vacuum sensing – MPXV6115VC6U + MCP6001UT-I/OT → Smoothieboard v1.1 → OpenPnP 2.6

Reference notes for adding analog vacuum sensing to the pick-and-place machine.

**Final parts:** NXP/Freescale **MPXV6115VC6U** vacuum sensor + Microchip **MCP6001UT-I/OT** op-amp.

> **Checked against datasheets:** MCP6001U pinout, supply/input/output ranges and bypass advice
> (Microchip DS20001733L); MPXV6115V pinout, transfer function, output current and application
> circuit (Freescale MPXV6115V Rev 3).
> Smoothieware `ad8495` options checked against <https://smoothieware.org/temperaturecontrol>.
> **Tested on the machine (2026-09-29):** signal on P0.23 (T0) with the config in §7, `heater_pin nc`
> sensor-only channel, readings in OpenPnP via `M105`.

---

## 1. Concept

```
pump ── restriction ──┬── nozzle
                      ├── vent valve (to outside air)
                      └── tee
                           │
     MPXV6115V   (5 V supply, 4.6 V at atmosphere → 0.2 V at full vacuum)
           │
     divider 51k / 100k  (× 0.662)  + RC low-pass
           │
     MCP6001U voltage follower  (3.3 V supply, rail-to-rail)
           │
     100 Ω → Smoothieboard thermistor input (LPC1769 ADC, 0–3.3 V)
           │
     Smoothieware temperature_control (ad8495 = linear)  →  M105  →  OpenPnP actuator
```

Why this way:

| Problem | Solution |
|---|---|
| Sensor output reaches **4.6 V** (up to ~4.8 V worst case), ADC max is **3.3 V** | Divider 51k/100k → 3.05 V nominal, 3.20 V at worst-case Vs = 5.25 V |
| Thermistor inputs have a **4.7 kΩ pull-up to 3.3 V** on the board, which would load a plain divider | Op-amp follower drives the pin with low impedance |
| Must never put > 3.3 V on the ADC | MCP6001U is powered from the **Smoothie 3.3 V**, so its output **physically can't exceed 3.3 V** |
| Must use as much ADC range as possible | MCP6001U inputs and outputs reach both supply rails (input VSS−0.3 … VDD+0.3 V, output within 25 mV of the rails), so the signal can go up to ~3.05 V |
| Sensor output current is limited (0.5 mA max) | Divider draws only ≈ 30 µA (151 kΩ total). The datasheet's own example load is 51 kΩ |
| Noise from the pump and steppers | 33 pF on sensor output + RC low-pass (≈ 210 Hz) + op-amp bypass caps |
| Op-amp driving the capacitor on the Smoothie input could oscillate | 100 Ω series resistor (R_ISO, datasheet §4.3) |

---

## 2. Schematic

```
 +5V (Smoothie serial debug header – see §6)
  │
  ├──────────┬──────────────┐
  │          │              │
  │       C1 100nF       C2 1.5µF (optional, bulk)
  │          │              │
  │         GND            GND
  │
  │   ┌───────────────┐
  └───┤ 2  Vs         │
      │               │
      │  MPXV6115VC6U │ 4  Vout
      │  (U1)         ├──────┬────── R1 51k ─────┬────────────────┐
      │               │      │                  │                │
      │ 3  GND        │   C3 33pF           R2 100k    C4 22nF   │
      └──────┬────────┘      │                  │         │      │
             │              GND                GND       GND     │
            GND                                                  │
   (pins 1, 5, 6, 7, 8: leave unconnected)                       │
                                                                 │
                                                                 │
 +3.3V (Smoothie) ──┬──────────────── 5  VDD                     │
                    │                                            │
                 C5 100nF          ┌─ 1  VIN+ ◄──────────────────┘
                 (≤ 2 mm from      │
                  pin 5)           │    MCP6001UT-I/OT  (U2, SOT-23-5)
                    │              │
                   GND        ┌─── 3  VIN−
                              │
                              │    4  VOUT ──┬── R3 100Ω ────► Smoothie P0.23
                              │              │                  (T0 thermistor input, signal pin)
                              └──────────────┘
                                   2  VSS ── GND ────────────► Smoothie GND
                                                                (serial debug header)
```

The MCP6001U is wired as a **voltage follower**: output connected straight to VIN−, gain = 1.
Put a 1 µF or larger capacitor on the 3.3 V supply within ~10 cm (datasheet §4.4). The Smoothieboard's own
3.3 V decoupling normally covers this if the wires are short.

### Pinouts (verified against datasheets)

**MPXV6115VC6U (SOP-8, pin 1 marked by notch / identifier)**

| Pin | Function |
|---|---|
| 2 | Vs (+5 V, 4.75–5.25 V) |
| 3 | GND |
| 4 | Vout |
| 1, 5, 6, 7, 8 | Internal / no connect – **leave unconnected** (not even to GND) |

**MCP6001UT-I/OT (SOT-23-5) – "U" variant!**

| Pin | Function |
|---|---|
| 1 | VIN+ |
| 2 | VSS (GND) |
| 3 | VIN− |
| 4 | VOUT |
| 5 | VDD (+3.3 V) |

> ⚠ The plain **MCP6001** (1 = VOUT, 2 = VSS, 3 = VIN+, 4 = VIN−, 5 = VDD) and the **MCP6001R**
> (1 = VOUT, 2 = VDD, 3 = VIN+, 4 = VIN−, 5 = VSS) have **different pinouts** in the same package.
> Make sure the reel/marking really is the **U** version. The U pinout matches the LM321 and LMV321.

---

## 3. Bill of materials

| Ref | Value | Note |
|---|---|---|
| U1 | MPXV6115VC6U | Vacuum sensor, −115…0 kPa, 5 V, ratiometric |
| U2 | MCP6001UT-I/OT | Single op-amp, rail-to-rail input and output, 1.8–6 V, SOT-23-5 |
| R1 | 51 kΩ 1 % | Divider top |
| R2 | 100 kΩ 1 % | Divider bottom |
| R3 | 100 Ω | Output isolation (R_ISO) |
| C1 | 100 nF ceramic | Sensor supply decoupling (datasheet application circuit) |
| C2 | 1.5 µF ceramic | Extra bulk on the sensor supply |
| C3 | 33 pF ceramic | Sensor output filter (datasheet application circuit shows 47 pF; 33 pF works the same here) |
| C4 | 22 nF ceramic | RC low-pass with the divider: R_th = 33.8 kΩ → fc ≈ 210 Hz, τ ≈ 0.75 ms |
| C5 | 100 nF ceramic | MCP6001 bypass, within 2 mm of pin 5 |

Supply currents: sensor 6 mA typ / 10 mA max from 5 V; op-amp ≈ 100 µA from 3.3 V.

Optional: if you want a slower, quieter signal, raise C4 to 47 nF (≈ 100 Hz). A pick takes tens of
milliseconds, so either value is fast enough.

---

## 4. Expected voltages

Sensor transfer function (datasheet): `Vout = Vs × (0.007652 × P + 0.92)`, P in kPa (−115 … 0).
With Vs = 5.0 V and the 51k/100k divider (× 0.6623):

| Vacuum (kPa) | Sensor Vout | Divider = op-amp out | Approx. at Smoothie pin* |
|---|---|---|---|
| 0 (atmosphere) | 4.60 V | 3.05 V | 3.05 V |
| −20 | 3.83 V | 2.54 V | 2.56 V |
| −40 | 3.07 V | 2.03 V | 2.06 V |
| −60 | 2.30 V | 1.53 V | 1.56 V |
| −80 | 1.54 V | 1.02 V | 1.07 V |
| −100 | 0.77 V | 0.51 V | 0.57 V |
| −115 (full) | 0.20 V | 0.13 V | 0.20 V |

\* The 4.7 kΩ on-board pull-up and R3 add a small **linear** offset
(`Vpin ≈ Vop + (3.3 − Vop) × 0.021`). That doesn't matter, because OpenPnP only compares readings.

Worst case: Vs = 5.25 V gives 4.83 V from the sensor → 3.20 V after the divider, still under 3.3 V. If the sensor
saturates higher still, the op-amp output stops at its 3.3 V supply anyway.

**Lower reading = more vacuum.** A typical PnP pump gives roughly −40 … −80 kPa at a sealed nozzle,
which is about 2.1 … 1.1 V at the pin: a swing of about 1 V (≈ 1200 ADC counts).

The sensor is **ratiometric**: its output scales with the 5 V supply. The ADC measures against 3.3 V, so any
drift in the 5 V supply shows up as drift in the reading. Use a stable 5 V (§6).

---

## 5. Build and bench test (before connecting to Smoothie)

1. Check the MCP6001 marking/reel is the **U** version and that the pins are soldered as in §2.
2. Power from a bench supply: 5 V to the sensor, 3.3 V to the op-amp, common GND. **Nothing connected to the Smoothie yet.**
3. Measure sensor pin 4: ≈ 4.6 V at atmosphere.
4. Measure U2 pin 1 (VIN+): ≈ 3.05 V.
5. Measure U2 pin 4 (VOUT): same as pin 1, within a few mV.
6. Suck on the tube or connect the pump. All three voltages should drop smoothly (see the table in §4).
7. Only connect to the Smoothieboard when VOUT is confirmed **≤ 3.3 V** and follows the input.

---

## 6. Wiring to the Smoothieboard

### As built

| Signal | Wire colors (doubled) | Where on the Smoothieboard v1.1 | Notes |
|---|---|---|---|
| **Vacuum signal** (U2 VOUT via R3) | green + yellow | **P0.23** – T0 thermistor input, signal pin | `ad8495_pin 0.23` in §7 |
| **+5 V** (sensor) | red + pink | **Serial debug header** – 5 V pin | |
| **GND** (whole board) | grey + blue | **Serial debug header** – GND pin | One common ground for sensor and op-amp |
| **+3.3 V** (op-amp) | brown + white | **VBB / 3.3V / GND connector** in the middle of the board – 3.3 V pin | Same 3.3 V the ADC measures against, so the op-amp output can't exceed it |

> ⚠ **The VBB / 3.3V / GND connector also carries VBB, the main supply (motor voltage, typically 12–24 V).**
> A wire on the wrong pin, or a connector plugged in the wrong way round, puts VBB straight into the MCP6001, and
> through its output into P0.23. That would destroy the op-amp and probably the LPC1769. Label the wires and
> check with a meter before powering up after any rework.
> Only the **brown + white** wires go to this connector, on its **3.3 V** pin.

Other thermistor inputs, if P0.23 is ever needed for something else:

| Connector | ADC pin (Smoothie config name) |
|---|---|
| T0 | `0.23` (used) |
| T1 | `0.24` |
| T2 | `0.25` |
| T3 | `0.26` |

### Notes

- **Ground:** one common ground. Don't split the 5 V and 3.3 V grounds; on the Smoothieboard they're the same
  ground plane. Using the GND pin of the VBB/3.3V/GND connector as well is fine. What matters is keeping pump,
  valve and motor return currents off the sensor's ground wire.
- **5 V:** the sensor is ratiometric, so a drifting 5 V shows up as a drifting reading. The serial header's 5 V is
  the Smoothie's 5 V rail. If that rail is fed only from USB, the reading shifts slightly when the USB supply changes.
  The on-board 5 V regulator (or an external 5 V supply) is more stable.
- **Power-up order:** if the sensor's 5 V ever comes from a separate supply, it could be live while the
  Smoothie's 3.3 V is off. R1 limits the current into the op-amp input to about 0.1 mA, well within its 2 mA rating.
- **Cable:** 8-core cable, each connection on two wires joined at both ends:
  red/pink = +5 V, grey/blue = GND, brown/white = +3.3 V, green/yellow = signal.
  If the cable is shielded, connect the shield at the Smoothie end only.

### Air line

The valve is a **vent valve**: it opens the line to outside air to release the part. When the sensor was fitted
the pump **ran constantly**. Since then OpenPnP has been set to switch it for each pick (see §8b). The sensor tees into the line about 10 cm from the nozzle holder. Pump, sensor, vent and nozzle all share one line,
so it doesn't matter which side of the valve the sensor is on. What matters is the **restriction** between the pump
and the line (see §8b).

---

## 7. Smoothieware configuration

Add a "temperature" channel that reads the voltage linearly. It uses the `ad8495` sensor type, which is documented
on <https://smoothieware.org/temperaturecontrol> under *AD8495 Thermocouple Amplifier*. The examples higher up
that page (`thermistor_pin`, `beta`, `coefficients`, `rt_curve`) are for the default **thermistor** sensor type
and aren't used here.

```
temperature_control.vacuum.enable          true
temperature_control.vacuum.sensor          ad8495
temperature_control.vacuum.ad8495_pin      0.23      # ADC pin of the thermistor input used (T0)
temperature_control.vacuum.ad8495_offset   0
temperature_control.vacuum.designator      V
temperature_control.vacuum.heater_pin      nc
temperature_control.vacuum.max_temp        1000      # MUST be above 660 – see below
```

### How the reading scales

Per the Smoothieware docs: `reading = V / 0.005 − ad8495_offset`. With offset 0, **1 V reads as 200**, and the
full 0–3.3 V ADC range maps to 0–660.

| Condition | Voltage at pin | `V:` reading |
|---|---|---|
| Atmosphere | ≈ 3.05 V | ≈ 610 (measured: 614) |
| Suck by mouth (bench test, ≈ −37 kPa) | ≈ 2.10 V | ≈ 420 |
| Pump, sealed nozzle (−60 … −80 kPa) | ≈ 1.56 … 1.07 V | ≈ 313 … 213 |

Then `M105` returns something like `ok T:... V:612.3 /0.0 @0`.

### Notes

- **`max_temp` is essential.** The docs say that exceeding `max_temp` turns off all heaters and puts Smoothie into
  **HALT** (clear with `M999` / reset). The atmospheric reading (≈ 612) is above a typical hotend limit, so set
  `max_temp` above the largest possible reading (660).
- **`heater_pin nc`:** "nc" is Smoothie's usual value for "not connected". The docs page doesn't describe using a
  channel as a sensor only, so on the first boot check that `M105` shows `V:` and nothing halts.
- **Pin 0.23 is the default hotend thermistor pin.** Remove or disable (`enable false`) the existing
  `temperature_control.hotend` section, and any other section that uses `0.23`.
- **Fallback** if your firmware build has no `ad8495` type: use the default thermistor sensor type. The reading
  is then not linear, but it still changes steadily in one direction with vacuum, and OpenPnP thresholds still work.

Test from the OpenPnP console (or a terminal): `M105` with the pump off, then with the pump on and the nozzle
blocked. The `V:` value must change clearly.

---

## 8. OpenPnP 2.6 configuration

1. **Machine Setup → Actuators →** use the existing `AVACS` actuator (or add one, e.g. `VAC_SENSE`)
   - Driver: the GcodeDriver
   - Value type: **Double**
   - `ACTUATOR_READ_COMMAND`: `M105`
   - `ACTUATOR_READ_REGEX`: `.*V:(?<Value>-?\d+\.?\d*).*`
   - Test with the **Read** button in the actuator panel.
2. **Nozzle** → set the *Vacuum Sense Actuator* to `AVACS`, and the vacuum actuator to the valve (`AVAC`).
   On this machine both were already set.
3. **Nozzle tip → Vacuum tab** (for each tip):
   - Take readings with the vacuum **off**, the vacuum **on and no part**, and a **part picked**.
   - Turn on the **Part On** check. The threshold goes between the "no part" and "part picked" readings.
   - Turn on the **Part Off** check. The threshold goes between the "part picked" and "no part" readings.
   - Try the *Establish Level* / *Difference* methods if a plain threshold isn't reliable
     (small parts on big tips give only small differences).
4. Run a few picks and discards and check the log to see whether the part detection fires correctly.

Always **close OpenPnP and back up `~/.openpnp2`** before editing `machine.xml` by hand.

---

## 8b. As built – air line and measured values (2026-09-29)

### Air-line layout

The pump ran constantly when this was measured. The valve (AVAC) is a **vent valve**: it opens the line to outside
air to drop the part.

> **Update 2026-10-05:** OpenPnP now switches the pump for each pick: head pump control "PartOn", `M808` at the
> pick and `M809` after the place, with a 0 ms pump-on wait. If the vacuum check runs before the line has pumped
> down, it reads atmosphere (≈ 610) and the pick fails with "No part detected". This happened on 2026-10-05 and
> was fixed. If it comes back, set a pump-on wait on the head or a longer pick dwell on the nozzle tip, or let
> the pump run constantly again.

```
pump ── restriction (short section of thinner tube) ──┬── sensor (≈ 10 cm from the nozzle holder)
                                                      ├── vent valve (AVAC)
                                                      └── nozzle
```

**The restriction is essential.** Without it the pump holds the whole line at full vacuum whether the tip is
open or blocked, so part detection can't work (measured before the restriction: 380–420 in every state).
It acts like an air version of a voltage divider. With the tip blocked, the line still reaches full pump vacuum.
With the tip open, air leaks in through the tip faster than the restriction lets it out, so the reading rises
towards atmosphere.

- Too little difference between open and blocked → use a narrower or longer restriction.
- Vacuum takes too long to build → use a wider or shorter restriction.

### Measured readings (smallest nozzle tip, `V:` value from `M105`)

| State | Reading |
|---|---|
| Vacuum off (vent open) | ≈ 614 |
| Vacuum on, tip empty | ≈ 500 |
| Vacuum on, part on tip | ≈ 380–400 |

### OpenPnP config applied

- Actuator **AVACS** (id `A1`): value type Double, driver GcodeDriver, read command `M105`,
  read regex `.*V:(?<Value>-?\d+\.?\d*).*`
- Nozzle **N**: vacuum sense actuator = AVACS, vacuum actuator = AVAC (already set).
- Backup of the config before this change: `~/.openpnp2/machine.xml.before-vacsense`

### Starting part-detection values (smallest tip, set in the GUI)

| Setting | Value | Why |
|---|---|---|
| Part On method | Absolute | |
| Part On low / high | 0 / 450 | halfway between part-held (≈ 400) and empty (≈ 500) |
| Pick dwell | ≈ 200 ms | vacuum must settle before the check; replace with the measured settling time |
| Part Off method | Absolute | |
| Part Off low / high | 450 / 560 | empty ≈ 500 passes. Part still stuck (< 450) fails. No vacuum (≈ 614) fails |
| Part-off probing time | ≈ 200 ms | vacuum is applied briefly for the check |

Every nozzle tip needs its own values. Larger tips read closer to 614 when empty, so the gap gets bigger.
If the reading jumps by more than about ±15 while nothing changes, widen the margins or increase C4 to 47 nF.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| VOUT doesn't follow VIN+ | Wrong MCP6001 variant (plain or R instead of U), or VIN− not tied to VOUT |
| Machine HALTs after boot | `max_temp` missing or below 660 in the `vacuum` section |
| Op-amp output stuck at 3.3 V at atmosphere | Divider not working – R1 (51k) missing or wrong value (happened during the build) |
| Reading doesn't change | Wrong ADC pin in config, sensor pins 1/5–8 connected, sensor 5 V missing |
| Same reading with tip open and blocked | Restriction between pump and line missing or too wide (§8b) |
| Reading stuck at ~3.3 V | Op-amp not powered, or divider R2 missing |
| Reading stuck near 0 V | Sensor 5 V missing, or R1 open |
| Noisy reading | Missing C4/C5, ground taken from a motor connector, unshielded cable next to steppers |
| Reading drifts over time | 5 V supply not stable (USB power), sensor warming up |
| Output oscillates (check with a scope) | R3 missing or shorted |
| Very small difference between "no part" and "part" | Restriction too wide, nozzle tip hole too big for the part, leaks in tubing |
| Vacuum builds too slowly / weak pick | Restriction too narrow, leaks in tubing |
| Op-amp or Smoothie dead after rework | Check the VBB/3.3V/GND connector wiring – VBB on the 3.3 V wire |

---

## 10. References

- Microchip MCP6001/1R/1U/2/4 datasheet (DS20001733L):
  <https://ww1.microchip.com/downloads/en/DeviceDoc/MCP6001-1R-1U-2-4-1-MHz-Low-Power-Op-Amp-DS20001733L.pdf>
- Freescale/NXP MPXV6115V datasheet (Rev 3): <https://docs.rs-online.com/6ca8/0900766b810bd3f3.pdf>
- ST datasheet for MPXV6115V6 / MPXV6115VC6 (second source): <https://www.st.com/resource/en/datasheet/mpxv6115v6.pdf>
