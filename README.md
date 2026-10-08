# OpenPnP machine – upgrade to 2.6, cameras, lighting, vacuum sensing and e-stop

Notes from the setup work in September 2026. Written so the machine can be modified later without
re-discovering everything. **Last checked against the live machine: 2026-10-05** (over SSH, read-only, with
OpenPnP running).

A reference copy of the live `~/.openpnp2/machine.xml` is kept next to this file as **`machine.xml`**.
It is the version OpenPnP last saved (2026-10-05 19:15: new X/Y speed limits, soft limits on, speed slider 100 %). The Smoothie `config.txt`
is kept next to it as **`smoothie-config.txt`** (copied 2026-10-05 19:12). Re-copy it after OpenPnP has been closed (it saves on
exit) to pick up GUI changes: `scp tdarlic@192.168.0.185:.openpnp2/machine.xml .`

**Contents**

1. [Machine overview and access](#1-machine-overview-and-access)
2. [Upgrade from OpenPnP v1 to 2.6](#2-upgrade-from-openpnp-v1-to-26)
3. [Bottom (up-looking) camera – placement and height](#3-bottom-up-looking-camera--placement-and-height)
4. [Bottom camera – alignment and calibration](#4-bottom-camera--alignment-and-calibration)
5. [Bottom camera lighting](#5-bottom-camera-lighting)
6. [Vacuum sensing – design](#6-vacuum-sensing--design)
7. [Vacuum sensing – as built on this machine](#7-vacuum-sensing--as-built-on-this-machine)
8. [Vacuum sensing – Smoothieware config](#8-vacuum-sensing--smoothieware-config)
9. [Vacuum sensing – OpenPnP config and part detection](#9-vacuum-sensing--openpnp-config-and-part-detection)
10. [E-stop indicator LED](#10-e-stop-indicator-led)
11. [Z probing (contact probe)](#11-z-probing-contact-probe)
12. [Troubleshooting](#12-troubleshooting)
13. [Change log – what was changed on the machine](#13-change-log--what-was-changed-on-the-machine)
14. [Open items](#14-open-items)
15. [References](#15-references)

---

## 1. Machine overview and access

| Item | Value |
|---|---|
| PC | hostname `openpnp`, Ubuntu 24.04, `ssh tdarlic@192.168.0.185` (password login, no SSH key installed yet) |
| OpenPnP | 2.6 (`2.6_2026-03-01_12-37-59.5bd404c`), installed in `/opt/openpnp`, Java 21 (OpenJDK) |
| Live OpenPnP config | `~/.openpnp2/` |
| First-run default config | `~/.openpnp2-clean/` (untouched, for reference) |
| Old v1 config | USB stick `/media/tdarlic/0E86-A3E6/.openpnp/`; identical copy in `~/Documents/.openpnp/` (**not read by 2.6**) |
| Controller | Smoothieboard v1.1 (LPC1769), OpenPnP driver `GcodeAsyncDriver` named "GcodeDriver" |
| Smoothie config | `config.txt` on the Smoothie SD card; on the PnP PC it mounts as `/media/tdarlic/A620-C10D/config.txt` |
| Serial port | `/dev/ttyACM0`, 115200 baud (Smoothieboard USB `1d50:6015`) |
| Nozzle | `N` (id `N1`), `ContactProbeNozzle`, probe actuator `N1PROBE` (G38.2, reads P1.29 via M119) |
| Nozzle tips | 6 tips in an automatic tip changer: N045 (`NT1`), N40, N14, N24, N400, N750 (see below) |
| Top camera | `TOP CAMERA`, Logitech C270 (`046d:0825`), USB port `usb-0000:00:14.0-9`, 1280×960. **To be replaced** by a new ULP camera (ordered 2026-10-08, see §13) |
| Bottom camera | `BOTTOM`, "HD USB Camera" (`05a3:9310`), USB port `usb-0000:00:14.0-2`, 960×720 |

### Actuators (v2 config)

| Name | Id | Function | G-code | Smoothie switch / pin |
|---|---|---|---|---|
| PUMP | AP1 | Vacuum pump | M808 on / M809 off | `switch.vac`, P2.6 |
| AVAC | ACT18d8a0aa2b7b8f06 | **Vent valve** (nozzle "vacuum actuator"): lets outside air into the vacuum line to drop the part | M800 on / M801 off | `switch.n1_vac`, P1.22 |
| AVACS | A1 | **Vacuum sensor** (numeric reading) | read: M105 | `temperature_control.vacuum`, P0.23 |
| LIGHT_TOP | AL1 | Top (down-looking) camera light | M820 / M821 | `switch.ledtop`, P2.7 |
| LIGHT_BOTTOM | AL2 | Bottom (up-looking) camera light | M810 / M811 | `switch.ledbtm`, P2.5 |
| N1PROBE | ACT18d939cc9acce525 | Contact probe for the nozzle | G38.2 / M119 | Z max endstop P1.29 |

Only AVACS and N1PROBE have the driver set explicitly. The others have no `driver-id` in `machine.xml`, but the
log shows their G-code is still sent to the GcodeDriver (the only driver), so they work.

During a pick OpenPnP sends `M808` (pump on) then `M800` (AVAC on), and after the place `M801` then `M809`.
The head's pump control is **PartOn** with a 0 ms pump-on wait, so the pump is switched for each pick.

### Configuration as checked on 2026-10-05

**Axes and motion** (`GcodeAsyncDriver`, motion control `ModeratedConstantAcceleration`, machine speed slider 100 %)

| Axis | Letter | Soft limits | Notes |
|---|---|---|---|
| x | X | 1 … 570 mm | **200 mm/s, 1200 mm/s²** (tested, 2026-10-05); backlash: one-sided, ≈ 0.127 mm |
| y | Y | 3 … 373 mm | **200 mm/s, 1200 mm/s²** (tested, 2026-10-05); backlash: one-sided, ≈ 0.127 mm |
| Z | Z | – | safe zone low −4.8 mm |
| C | A | −180 … 180° | rotation, wrap-around, limited |
| zTop / rotationTop | – | – | virtual axes for the top camera |

Homing: Smoothie order ZXY, then visual homing on the fiducial at X 18.75 / Y 35.39 (`ResetToFiducialLocation`).
Machine homes after enable and parks after homing (park X 562.4 / Y 362.1).
Discard location X −20.8 / Y 4.9 / Z −15.

**Cameras**

| | TOP CAMERA | BOTTOM |
|---|---|---|
| Units per pixel | 0.0343 / 0.0345 mm at Z −40.3; 0.0222 mm at Z −22 (3D units per pixel on) | 0.0315 / 0.0312 mm |
| Location | head-mounted, offset 0 | X −44.15, Y 95.81, Z −7.8, rotation −180 |
| Advanced Camera Calibration | data present, **not enabled / not valid** (RMS 1.04 px) | **enabled and valid**, RMS 3.99 px |
| Exposure / white balance | manual 25 / manual 4000 K | manual 120 / manual 4600 K |
| Light | LIGHT_TOP | LIGHT_BOTTOM |

Nozzle head offset (to the top camera): X −106.55, Y −35.47.

**Nozzle tips** (the tip changer slots are at X −21 … 6, Y 197 + n × 22, Z −31.6 / −37)

| Tip | Id | Changer Y | Part dia. (max) | Pick / place dwell | Part On | Part Off |
|---|---|---|---|---|---|---|
| N045 | NT1 | 197 | 2–20 mm | 100 / 100 ms | Difference (diff. limits 0/0 – **not set up**) | Difference (0/0 – not set up) |
| N40 | TIP18da2f15bd729790 | 219 | ≤ 3 mm | 50 / 50 ms | Absolute 380 … 590 | None |
| N14 | TIP18db5cc4df037699 | 241 | ≤ 20 mm | 150 / 150 ms | None | None |
| N24 | TIP18db5d2bf7576c00 | 263 | ≤ 20 mm | 100 / 100 ms | None | None |
| N400 | TIP18db5d446248644a | 285 | ≤ 20 mm | 100 / 100 ms | None | None |
| N750 | TIP18db5d5650614cf2 | 307 | ≤ 20 mm | 150 / 150 ms | None | None |

N40 was the loaded tip. Its runout calibration works: the measured offsets are about 0.2 mm and the model error is
0.015–0.025 mm. All tips recalibrate on a tip change, and N045 recalibrates on machine home. Nozzle pick and place
dwell is 100 ms on top of the tip's dwell.

**Feeders and parts**

- Feeders: just **one** left, `Upper Strips - 1` (`ReferenceStripFeeder`, id F5) with **R0603-1K**, 8 mm white
  paper tape, 4 mm pitch, vision on, reference hole X 18.45 / Y 216.09 / Z −37. The 8 test feeders from
  September have been removed.
- Parts (`parts.xml`): FIDUCIAL-1X2-FIDUCIAL1X2, FIDUCIAL-HOME, R0201-1K, R0402-1K, R0603-1K, R0805-1K.
- Packages: FIDUCIAL-1X2, FIDUCIAL-HOME, R0201, R0402, R0603, R0805, TQFP32.
- Job order: `NozzleTips`. Bottom vision (`BVS_Default`) is on, with no pre-rotate.

**Smoothie `config.txt`** (main values, file dated 2026-10-05 16:33)

| Setting | Value |
|---|---|
| Steps/mm X / Y / Z / A | 320.25 / 320 / 812.7 / 80.34 |
| Acceleration | **1200** mm/s² (was 2500; Z 1000, A 5000) |
| Max speed X / Y / Z / A | **15000 / 15000** (was 20000) / 15000 / 60000 mm/min |
| Currents X / Y / Z / A | 0.5 / 0.6 / 0.5 / 0.2 A |
| Travel | X 0–570, Y 0–373 (home to min), Z homes to max |
| Endstops | X 1.24/1.25, Y 1.26/1.27, Z 1.29 (min) / 1.28 (max) |
| Extruders | hotend and hotend2 disabled |
| Kill button | P2.12, toggle |
| Switches / vacuum sensor | see the actuator table above, and §8 |

### Working rules

- **Close OpenPnP completely before editing `~/.openpnp2/*.xml`.** OpenPnP rewrites its config files when it
  exits, which would overwrite any edits. Check it's really gone: `ps aux | grep "[i]nstall4j.org.openpnp.Main"`.
- **Back up first:** `tar czf ~/openpnp2-backup-$(date +%F-%H%M).tgz ~/.openpnp2`.
  The folder `~/.openpnp2/org.openpnp.machine.reference.solutions.VisionSolutions` (≈ 1.7 GB of calibration
  images) makes backups big. It can be excluded with `--exclude=VisionSolutions`.
  The old `ImageWriteDebug` folder has been removed. OpenPnP also keeps its own snapshots in
  `~/.openpnp2/backups/` (49 so far).
- Smoothie reads `config.txt` **only at boot**. After editing it, reset or power-cycle the board.

---

## 2. Upgrade from OpenPnP v1 to 2.6

### Approach

**Don't convert the v1 `machine.xml`.** Build the machine configuration fresh in 2.6 using
**Issues & Solutions**, and carry over only the parts library and a few reference values. That's also what
the OpenPnP 2.0 upgrade notes recommend (`/opt/openpnp/OPENPNP_2_0.md`).

### What was found

- `~/Documents/.openpnp` is a byte-identical copy of the v1 config on the USB stick. 2.6 doesn't use it.
- v2.6 setup in `~/.openpnp2` was already under way: GcodeDriver, axes (x, y, Z, rotation + virtual zTop),
  actuators, 8 test strip feeders (`Upper/Lower Strips 1–4`), about 30 backups.
- At the time of checking, the v2 config had only one camera, `TOP CAMERA` (down-looking). The bottom camera
  `BOTTOM` has since been added and calibrated (status on 2026-10-05: see §1).

### Old v1 config – for reference

- Machine speed 0.99, job order `PartHeight`, GcodeDriver over serial, max feed rate 25000.
- Cameras: `Head` (down), `Bottom` (up). Units per pixel were about 0.028–0.030 mm/px.
  **Don't copy these.** Use them only to sanity-check the 2.6 camera calibration.
- Actuators: `UpCamLights`, `DownCamLights`, `A1`.
- Event scripts (`scripts/Events/`):
  - `Camera.BeforeSettle.js` and `Camera.AfterCapture.js`: switched the lights using `UpCamLights`/`DownCamLights`.
    **Not needed in 2.6.** Each camera has its own light actuator setting (use LIGHT_TOP / LIGHT_BOTTOM).
    The old actuator names don't exist any more anyway.
  - `NozzleCalibration.Starting.js` and `.Finished.js`: changed the bottom camera exposure during nozzle
    calibration. Only bring these back if calibration has trouble with exposure.

**v1 feeders → parts** (15 strip feeders). Use this as the checklist when recreating feeders in 2.6.
Positions must be taught fresh.

| Feeder | Part |
|---|---|
| R0603-1K | R0603-1K |
| R0603-4K7 | R0603-4K7 |
| R0603-10K | R0603-10K |
| R0603-22K | R0603-22K |
| R0603-51K | R0603-51K |
| R0603-22R | R0603-22R |
| R0603-0R2 | R0603-R8 |
| C0603-100nF | C0603-100nF |
| C0603-22pF_C12 | C12_C0603-22pF |
| C0603-27pF | C0603-27pF |
| C0603-33pF | C0603-33pF |
| C0603-150pF | C0603-150pF |
| C0603-Ferrite_L2 | C0603-L2-Ferrite |
| C0805-10uF | C0805-10uF |
| SOD123-ZENER3.3V | ZEENER-3V3 |

**v1 parts** (23): FIDUCIAL-1X2-FIDUCIAL1X2, FIDUCIAL-2MM, FIDUCIAL-HOME, FIDUCIAL_1mm, R0603-1K, R0603-4K7,
R0603-10K, R0603-22K, R0603-51K, R0603-22R, R0603-R8, C0603-100nF, C0603-27pF, C0603-33pF, C0603-150pF,
C12_C0603-22pF, C0603-L2-Ferrite, C0805-10uF, ZEENER-3V3, test, test_capacitor, test_resisitor, test_sot_225.

### What to carry over

| v1 item | What to do |
|---|---|
| `parts.xml` / `packages.xml` | Merge into the v2 files (don't overwrite; v2 already has parts). Check footprints and nozzle-tip compatibility afterwards |
| Strip feeders | Recreate in 2.6. Old positions assume the old axis and camera calibration |
| Camera units per pixel | Sanity check only; let 2.6 calibrate |
| Light event scripts | Drop; use each camera's light actuator setting |
| Exposure scripts | Only if nozzle calibration needs them |
| G-code, speeds, backlash, homing | Reference only; redo through Issues & Solutions |

### Suggested order

1. Back up `~/.openpnp2`.
2. Issues & Solutions, in this order: controller and axes → homing → cameras → nozzle and tip calibration.
3. Add the bottom camera.
4. Merge the parts and packages from v1 (with OpenPnP closed).
5. Recreate the feeders from the table above.
6. Test job on scrap; compare placement accuracy with the old machine.

---

## 3. Bottom (up-looking) camera – placement and height

### The top and bottom cameras never need to look at each other

Both cameras are referenced to the **nozzle**, not to each other:

- **Top camera ↔ nozzle:** Issues & Solutions has you center the top camera on a mark on the bed, then touch
  the nozzle tip to the same point. That gives the offset between them.
- **Bottom camera position:** jog the **nozzle tip** over the bottom camera and center it in the image. That X/Y is
  the camera's location. Its Z comes from focusing on the nozzle tip.
- The bottom camera calibration and nozzle runout calibration then use the nozzle as the reference.

So what matters is where the **nozzle** can reach, not the top camera.

### Placement

- The nozzle must reach the camera center, with margin, inside the soft limits. Check with the nozzle selected,
  because it's offset from the top camera.
- Put it on the path between the feeders and the board, so parts don't take a detour.
- The largest part, including its rotation (diagonal), must fit in the image with a few mm to spare.
- Mount it rigidly. Any movement after calibration becomes placement error.
- Leave room for the ring light. Keep it from lighting the top camera's view, and from being lit by it.

### Height and focus

- **Focus is not at PCB height.** Focus it relative to the height the nozzle travels at.
- **Target:** focal plane = travel height minus the tallest part's height. The bare nozzle tip is in focus there.
  During bottom vision, OpenPnP raises the nozzle by the part's height so that the part's underside sits in the
  focal plane.
- **Upper limit:** the nozzle still needs room to rise by the tallest part's height above the focal plane.
- **Lower limit:** just reachable Z. It doesn't have to be at the bottom of the Z range.
- The camera, lens and light must stay below anything the nozzle carries while travelling.
- Mounting it higher than on the old machine removes the move down and up for every part.

---

## 4. Bottom camera – alignment and calibration

**Observation:** with the tilt/yaw screws set as well as possible, the point where the nozzle stays still as it
moves up and down is still off the image center.

**Reason:** two separate things decide that point:

- **Tilt**, meaning the camera's axis compared with the machine's Z. The screws fix this.
- **Where the lens axis hits the sensor.** On cheap USB cameras it's often several to tens of pixels off center,
  because the lens and sensor aren't perfectly centered. The screws can't fix this, and it's normal.

**Procedure:**

1. Adjust the tilt roughly (vertical by eye), then tighten everything.
2. At the camera's focus height, center the nozzle in the image. That becomes the camera location.
3. Run **Advanced Camera Calibration** on the bottom camera (camera → Calibration). It uses the nozzle tip at two
   heights and works out where the lens axis really is, the remaining tilt, lens distortion and mm per pixel,
   then corrects the image.
4. Then run nozzle tip (runout) calibration.

**Investigate mechanically only if:**

- the still point is near the edge of the image (loose, cross-threaded or badly off-center lens), or
- the nozzle's image traces a curve as it moves in Z, or it visibly moves sideways (bent or loose Z axis).

---

## 5. Bottom camera lighting

### Decision

The bottom camera light was **changed from red LEDs to white LEDs.**

### Why white rather than red (or 617 nm "amber")

- **Color sensor:** only about a quarter of its pixels respond to red, so red light gives a darker, noisier and
  less sharp image. A monochrome sensor wouldn't have this problem.
- **Ceramic capacitors:** tan or brown bodies reflect red and orange strongly, so the body looks almost as bright
  as the silver ends. Vision can then merge them into one blob. White, blue or green light separates them much better.
- **617 nm** is red-orange, not true amber (about 590 nm). It behaves almost exactly like red, so it's no improvement.
- If red ever has to be used: add a red filter over the lens (blocks room light) and use only the red channel in
  the vision pipeline instead of `ConvertColor Bgr2Gray`, which counts red at only about 30%.

### Setting the brightness – not as bright as possible

1. **Turn off auto exposure**, auto gain and auto white balance on the bottom camera. They fight the lighting and
   make vision thresholds unreliable.
2. Set gain low.
3. Put a shiny part (resistor or capacitor ends) on the nozzle at the focus height.
4. Adjust the LED brightness (or the exposure) until the ends are **just below pure white**, with the body clearly
   darker. No blown-out areas.
5. Check the pipeline gets a clean outline with some margin.

Notes:

- **PWM dimming:** use a high frequency (tens of kHz) or a constant-current driver. At low frequencies the camera
  catches the flicker, as dark bands or brightness changing between frames.
- **Diffusion** matters more than color. Soft light means less glare off shiny ends.
- Don't run the LEDs at maximum current. They drift as they heat up.
- After settling the lighting, **redo the bottom camera and nozzle tip calibration.**

---

## 6. Vacuum sensing – design

> The stand-alone vacuum sensor document is **`vacuum-sensor.md`**, kept with the vacuum sensor PCB in its GitHub
> project. It covers the circuit, the wiring and air line as built, the Smoothieware and OpenPnP setup, and
> troubleshooting. Sections 6–10 here cover the same ground for this machine; update both when something changes.

**Parts:** NXP/Freescale **MPXV6115VC6U** vacuum sensor + Microchip **MCP6001UT-I/OT** op-amp.

> Checked against the datasheets: MCP6001U pinout, ranges and bypass advice (Microchip DS20001733L);
> MPXV6115V pinout, transfer function, output current and application circuit (Freescale MPXV6115V Rev 3).
> Smoothieware `ad8495` options checked against <https://smoothieware.org/temperaturecontrol>.

### Signal chain

```
vacuum line ── MPXV6115V   (5 V supply, 4.6 V at atmosphere → 0.2 V at full vacuum)
                   │
             divider 51k / 100k  (× 0.662)  + RC low-pass
                   │
             MCP6001U voltage follower  (3.3 V supply, rail-to-rail)
                   │
             100 Ω → Smoothieboard P0.23 (T0 thermistor input, LPC1769 ADC 0–3.3 V)
                   │
             Smoothieware temperature_control (ad8495 = linear)  →  M105  →  OpenPnP actuator AVACS
```

### Design decisions

| Problem | Solution |
|---|---|
| Sensor output reaches **4.6 V** (up to ~4.8 V worst case), ADC max is **3.3 V** | Divider 51k/100k → 3.05 V nominal, 3.20 V at worst-case Vs = 5.25 V |
| Thermistor inputs have a **4.7 kΩ pull-up to 3.3 V** on the board, which would load a plain divider | Op-amp follower drives the pin with low impedance |
| Must never put > 3.3 V on the ADC | MCP6001U is powered from the **Smoothie 3.3 V**, so its output **physically can't exceed 3.3 V** |
| Use as much ADC range as possible | MCP6001U inputs and outputs reach both rails (input VSS−0.3 … VDD+0.3 V, output within 25 mV of the rails) |
| Sensor output current is limited (0.5 mA max) | Divider draws only ≈ 30 µA (151 kΩ total) |
| Noise from the pump and steppers | 33 pF on sensor output + RC low-pass (≈ 210 Hz) + bypass caps |
| Op-amp driving the capacitor on the Smoothie input could oscillate | 100 Ω series resistor (R_ISO, datasheet §4.3) |

### Op-amp choice – history

| Part | Verdict |
|---|---|
| LMV822 (first idea) | Would work at 3.3 V, but input range only reaches about 2.4 V → needed a divider to about 2.1 V |
| LM321MF | Input and output only reach about V+ − 1.5 V → must run from 5 V; output then isn't limited by the 3.3 V rail. Worked in principle |
| MCP6007 (dual, SOIC-8) | Good: rail-to-rail, 3.3 V, built-in filtering against radio interference, easy to solder |
| **MCP6001UT-I/OT** | **Chosen.** Rail-to-rail, 3.3 V, and the U pinout matches the LM321/LMV321 footprint |

### Schematic

```
 +5V (from Smoothie serial debug header – see §7)
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
 +3.3V (from Smoothie VBB/3.3V/GND connector – see §7)           │
   │                                                             │
   ├──────────────────────────────── 5  VDD                      │
   │                                                             │
 C5 100nF                   ┌─ 1  VIN+ ◄─────────────────────────┘
 (≤ 2 mm from pin 5)        │
   │                        │    MCP6001UT-I/OT  (U2, SOT-23-5)
  GND                       │
                       ┌─── 3  VIN−
                       │
                       │    4  VOUT ──┬── R3 100Ω ────► Smoothie P0.23 (T0 signal pin)
                       │              │
                       └──────────────┘
                            2  VSS ── GND
```

The MCP6001U is wired as a **voltage follower**: output connected straight to VIN−, gain = 1.

### Pinouts (checked against datasheets)

**MPXV6115VC6U (SOP-8, pin 1 marked by notch)**

| Pin | Function |
|---|---|
| 2 | Vs (+5 V, 4.75–5.25 V) |
| 3 | GND |
| 4 | Vout |
| 1, 5, 6, 7, 8 | Internal / no connect – **leave unconnected** (not even to GND) |

**MCP6001UT-I/OT (SOT-23-5) – "U" variant**

| Pin | Function |
|---|---|
| 1 | VIN+ |
| 2 | VSS (GND) |
| 3 | VIN− |
| 4 | VOUT |
| 5 | VDD (+3.3 V) |

> ⚠ The plain **MCP6001** (1 = VOUT, 2 = VSS, 3 = VIN+, 4 = VIN−, 5 = VDD) and the **MCP6001R**
> (1 = VOUT, 2 = VDD, 3 = VIN+, 4 = VIN−, 5 = VSS) have **different pinouts** in the same package.
> When replacing U2, make sure it's the **U** version.

### Bill of materials

| Ref | Value | Note |
|---|---|---|
| U1 | MPXV6115VC6U | Vacuum sensor, −115…0 kPa, 5 V, ratiometric |
| U2 | MCP6001UT-I/OT | Single op-amp, rail-to-rail input and output, 1.8–6 V, SOT-23-5 |
| R1 | 51 kΩ 1 % | Divider top (marking 513, bands green-brown-orange – **not** 15k = 153) |
| R2 | 100 kΩ 1 % | Divider bottom |
| R3 | 100 Ω | Output isolation (R_ISO) |
| C1 | 100 nF ceramic | Sensor supply decoupling (datasheet application circuit) |
| C2 | 1.5 µF ceramic | Extra bulk on the sensor supply |
| C3 | 33 pF ceramic | Sensor output filter (datasheet application circuit shows 47 pF; 33 pF works the same here) |
| C4 | 22 nF ceramic | RC low-pass with the divider: fc ≈ 210 Hz. 47 nF → ≈ 100 Hz if the reading is noisy |
| C5 | 100 nF ceramic | MCP6001 bypass, within 2 mm of pin 5 |

Supply currents: sensor 6 mA typ / 10 mA max from 5 V; op-amp ≈ 100 µA from 3.3 V.

### Expected voltages

Sensor transfer function (datasheet): `Vout = Vs × (0.007652 × P + 0.92)`, P in kPa (−115 … 0).
With Vs = 5.0 V and the divider (× 0.6623). Smoothie reading = pin voltage × 200 (see §8).

| Vacuum (kPa) | Sensor Vout | Op-amp out | At Smoothie pin* | `V:` reading |
|---|---|---|---|---|
| 0 (atmosphere) | 4.60 V | 3.05 V | 3.05 V | ≈ 610 |
| −20 | 3.83 V | 2.54 V | 2.56 V | ≈ 511 |
| −40 | 3.07 V | 2.03 V | 2.06 V | ≈ 412 |
| −60 | 2.30 V | 1.53 V | 1.56 V | ≈ 313 |
| −80 | 1.54 V | 1.02 V | 1.07 V | ≈ 213 |
| −100 | 0.77 V | 0.51 V | 0.57 V | ≈ 114 |
| −115 (full) | 0.20 V | 0.13 V | 0.20 V | ≈ 40 |

\* The 4.7 kΩ on-board pull-up and R3 add a small **linear** offset (`Vpin ≈ Vop + (3.3 − Vop) × 0.021`).

**Lower reading = more vacuum.**
The sensor is **ratiometric**: its output scales with the 5 V supply, so a drifting 5 V shows up as a drifting reading.

### Bench test (repeat after any repair)

1. Power from a bench supply: 5 V to the sensor, 3.3 V to the op-amp, common GND. Smoothie **not** connected.
2. Sensor pin 4: ≈ 4.6 V at atmosphere.
3. U2 pin 1 (VIN+): ≈ 3.05 V (= 0.662 × sensor output).
4. U2 pin 4 (VOUT): same as pin 1, within a few mV.
5. Suck on the tube: the voltages drop smoothly. **Measured:** 3.05 V → 2.10 V (≈ −37 kPa).
6. Only connect to the Smoothie when VOUT stays **≤ 3.3 V**.

> Lesson from the build: the first test gave 3.3 V → 3.15 V because **R1 (51k) was missing**. An op-amp output
> stuck at 3.3 V at atmosphere means the divider isn't working.

---

## 7. Vacuum sensing – as built on this machine

### Electrical connections to the Smoothieboard v1.1

| Signal | Wire colors (doubled) | Where on the Smoothieboard | Notes |
|---|---|---|---|
| **Vacuum signal** (U2 VOUT via R3) | green + yellow | **P0.23** – T0 thermistor input, signal pin | Configured as `ad8495_pin 0.23` |
| **+5 V** (sensor) | red + pink | **Serial debug header** – 5 V pin | |
| **GND** (whole sensor board) | grey + blue | **Serial debug header** – GND pin | One common ground for sensor and op-amp |
| **+3.3 V** (op-amp) | brown + white | **VBB / 3.3V / GND connector** in the middle of the board – 3.3 V pin | Same 3.3 V the ADC measures against |

> ⚠ **The VBB / 3.3V / GND connector also carries VBB, the main supply (motor voltage, typically 12–24 V).**
> A wire on the wrong pin, or a connector plugged in the wrong way round, puts VBB straight into the MCP6001, and
> through its output into P0.23. That would destroy the op-amp and probably the LPC1769. Label the wires and
> check with a meter before powering up after any rework.
> Only the **brown + white** wires go to this connector, on its **3.3 V** pin.

Notes:

- **Ground:** use one common ground. Don't split the 5 V and 3.3 V grounds; on the Smoothieboard they're the same
  ground plane. If the GND pin of the VBB/3.3V/GND connector is also used, that's fine too; it's the same plane.
  What matters is keeping pump, valve and motor return currents off the sensor's ground wire.
- **5 V source:** the serial header's 5 V is the Smoothie's 5 V rail. If that rail is fed only from USB, the
  reading shifts slightly when the USB supply changes. The Smoothie's on-board 5 V regulator (or an external
  5 V supply) is more stable.
- **Cable:** 8-core cable, each connection on two wires joined at both ends:
  red/pink = +5 V, grey/blue = GND, brown/white = +3.3 V, green/yellow = signal.
  If the cable is shielded, connect the shield at the Smoothie end only.

### Air line

When the sensor was fitted (2026-09-29) the pump **ran constantly**. AVAC is a **vent valve**: it opens the line
to outside air to release the part.

> **Update 2026-10-05:** the OpenPnP config now switches the pump for each pick: head pump control "PartOn",
> `M808` at the pick, `M809` after the place (Smoothie `switch.vac`, P2.6). The pump-on wait is 0 ms. AVAC is
> switched on (`M800`) at the pick and off (`M801`) at the place. With the vent-valve design, that means `M800`
> must *close* the vent. If the pump is wired to P2.6 it no longer runs constantly. Because of the 0 ms pump-on
> wait, the vacuum check after the pick can then read before the line has pumped down. On 2026-10-05 several
> picks with N40 read about 610 (atmosphere) and failed with "No part detected". The user then fixed the reading.
> If the problem comes back, set a pump-on wait or a longer pick dwell.

```
pump ── restriction (short section of thinner tube) ──┬── sensor (≈ 10 cm from the nozzle holder)
                                                      ├── vent valve AVAC (to outside air)
                                                      └── nozzle
```

**The restriction is essential.** Without it the pump holds the whole line at full vacuum whether the tip is open
or blocked. Measured before the restriction was fitted: 380–420 in every state, which is useless for detection.

It works like an air version of a voltage divider:

- Tip blocked: no airflow → line reaches full pump vacuum. Holding force on the part is unchanged; the line just
  takes a little longer to pump down.
- Tip open: air leaks in through the tip faster than the restriction lets it out → reading rises towards atmosphere.
- Vent open: line goes close to atmosphere → the part releases more cleanly.

Tuning:

- Too little difference between open and blocked → narrower or longer restriction.
- Vacuum takes too long to build → wider or shorter restriction.
- Alternatives: a blunt dispensing needle inline (18G ≈ 0.8 mm, 20G ≈ 0.6 mm, 22G ≈ 0.4 mm inside diameter),
  or an adjustable needle valve. Aim for the smallest tip's open reading to sit about halfway between the blocked
  reading and atmosphere.

### Measured readings (smallest nozzle tip NT1, restriction fitted)

| State | `V:` reading |
|---|---|
| Vacuum off (vent open) | ≈ 614 |
| Vacuum on, tip empty | ≈ 500 |
| Vacuum on, part on tip / tip blocked | ≈ 380–400 (≈ −40 … −45 kPa) |

Larger tips will read closer to 614 when empty, so their gap will be bigger.

---

## 8. Vacuum sensing – Smoothieware config

In `config.txt` on the Smoothie SD card (`/media/tdarlic/A620-C10D/config.txt` when mounted on the PnP PC):

```
temperature_control.vacuum.enable          true
temperature_control.vacuum.sensor          ad8495
temperature_control.vacuum.ad8495_pin      0.23      # ADC pin of the thermistor input used (T0)
temperature_control.vacuum.ad8495_offset   0
temperature_control.vacuum.designator      V
temperature_control.vacuum.heater_pin      nc
temperature_control.vacuum.max_temp        1000      # MUST be above 660 - see instructions
```

- The `ad8495` type (Smoothieware docs, *AD8495 Thermocouple Amplifier*) reads the pin voltage linearly:
  `reading = V / 0.005 − ad8495_offset`. With offset 0, **1 V reads as 200**, and 0–3.3 V maps to 0–660.
- The examples higher up that docs page (`thermistor_pin`, `beta`, `coefficients`, `rt_curve`) are for the default
  thermistor sensor type and aren't used here.
- **`max_temp` must stay above 660.** Exceeding `max_temp` puts Smoothie into HALT (clear with `M999` or reset), and
  the atmospheric reading (≈ 612) is above a normal heater limit.
- There must be **no other `temperature_control` section using `0.23`**. That's the default hotend thermistor pin.
  Checked: none on this machine.
- `M105` returns something like `ok V:612.3 /0.0 @0`.
- Smoothie reads `config.txt` only at boot, so reset the board after editing it.

---

## 9. Vacuum sensing – OpenPnP config and part detection

### Applied to `~/.openpnp2/machine.xml` (2026-09-29)

- Actuator **AVACS** (id `A1`):
  - value type **Double** (was Boolean)
  - assigned to the driver `DRV18d8a0e0eed282b5` (GcodeDriver)
  - `ACTUATOR_READ_COMMAND`: `M105 ; read vacuum sensor`
  - `ACTUATOR_READ_REGEX`: `.*V:(?<Value>-?\d+\.?\d*).*`
    (tested against `ok V:612.3 /0.0 @0` and `ok T:21.5 /0.0 @0 V:418.0 /0.0 @0` – both give the V value)
- Nozzle **N** already had: vacuum sense actuator = AVACS, vacuum actuator = AVAC. No change.
- Check the reading: Machine Controls → Actuators → read AVACS → ≈ 614 with vacuum off. **Confirmed working.**

The XML added to the driver's `<commands>`, in case it needs to be recreated:

```xml
<command head-mountable-id="A1" type="ACTUATOR_READ_COMMAND">
   <text><![CDATA[M105 ; read vacuum sensor]]></text>
</command>
<command head-mountable-id="A1" type="ACTUATOR_READ_REGEX">
   <text><![CDATA[.*V:(?<Value>-?\d+\.?\d*).*]]></text>
</command>
```

### Starting part-detection values – nozzle tip NT1 (set in the GUI)

| Setting | Value | Why |
|---|---|---|
| Part On method | Absolute | |
| Part On low / high | 0 / 450 | halfway between part held (≈ 400) and empty (≈ 500) |
| Pick dwell | ≈ 200 ms | vacuum must settle before the check (was 0). Replace with the measured settling time |
| Part Off method | Absolute | |
| Part Off low / high | 450 / 560 | empty (≈ 500) passes; part still stuck (< 450) fails; no vacuum at all (≈ 614) fails |
| Part-off probing time | ≈ 200 ms | vacuum is applied briefly for the check |

### What is actually configured (checked 2026-10-05)

The starting values above were **not** applied as written. Current settings in `machine.xml`:

| Tip | Part On | Part Off | Pick dwell |
|---|---|---|---|
| N045 (NT1) | **Difference**, but the difference limits are 0 / 0. The absolute limits 390 / 430 are filled in and only count with the Absolute method | Difference, 0 / 0 | 100 ms |
| N40 | Absolute 380 … 590 | None | 50 ms (+ 100 ms nozzle dwell) |
| N14, N24, N400, N750 | None | None | 100–150 ms |

For N40, 590 is above the "empty" reading of about 500 measured on the smallest tip. An empty N40 tip would
probably pass the Part On check. Measure N40 empty and with a part, then set the high limit halfway between them
(see below). Log readings with N40 on 2026-10-05: about 556–568 at the picks that passed, 610 when there was no
vacuum.

### Setting up another nozzle tip

1. With the tip fitted, read AVACS in three states: vacuum off, vacuum on with the tip empty, vacuum on with the
   **smallest part** used on that tip.
2. Part On: 0 to halfway between "part" and "empty".
3. Part Off: from that halfway point to about midway between "empty" and "vacuum off".
4. Dwell / probing time: at least the time the reading takes to settle.
5. If "part" and "empty" are close together, use the relative / difference methods ("establish level"),
   or turn off the checks for that tip.
6. Test: normal picks, and a deliberate pick from an **empty** feeder slot. The job must report the failure.

Noise check: read AVACS several times without changing anything. If it jumps by more than about ±15, widen the
margins or increase C4 to 47 nF.

---

## 10. E-stop indicator LED

Built and working 2026-10-07. A LED in the e-stop box lights while the e-stop is pressed, so it's obvious before
power-up (the Smoothie stays in its bootloader if the e-stop is pressed at power-up, see §12).

### Why it isn't driven from the Smoothie signal

The e-stop's first contact pulls `kill_button_pin 2.12` to Smoothie GND. That line is only held high by a weak
pull-up, so it **must not be loaded**. A first try with an NPN transistor (base through 1 kΩ on the signal) failed:
the base-emitter junction clamps the line at ≈ 0.7 V (it would need ≈ 2.6 mA), so the board read "pressed" and
didn't boot. The LED is therefore driven from the e-stop's **second, separate NC contact**, which has no electrical
connection to the Smoothie.

### Circuit

The NC contact is closed while the e-stop is released and opens when it's pressed, so one N-MOSFET inverts it:

```
        +24V                      +24V
          |                         |
        R1 100k                LED + series R
          |                         |
          |                      D  |
          +-------------+-----G----Q1 FDN337N
          |             |        S  |
     NC contact       R2 33k        |
     (2nd block)        |           |
          |             |           |
         GND           GND         GND
   (gate node = junction of R1, R2 and the NC contact)
```

| State | NC contact | Q1 gate | LED |
|---|---|---|---|
| E-stop released | closed | 0 V (shorted to GND) | off |
| E-stop pressed | open | 24 V × 33k / 133k ≈ 5.95 V | on |

- **Q1 = FDN337N** (logic-level, fully on from ≈ 2.5 V, 2.2 A). Its gate is rated **±8 V absolute max**, so R2 is
  required: without it the gate would see the full 24 V. With 33k the gate gets ≈ 6 V (≈ 6.5 V at 26 V supply).
  For more margin use two 33k in parallel (≈ 3.4 V, still fully on). 27k (≈ 5 V) was the first choice.
- If a BSS138 or 2N7000 is used instead (±20 V gate, ≤ 150–200 mA LED current): R2 = 68k (≈ 10 V).
- R1 draws a constant 0.24 mA through the NC contact while the e-stop is released.
- LED series resistor: (24 V − Vf) / I, e.g. one red LED at 7–10 mA → 2.2–3.3 kΩ, 0.5 W. A 24 V indicator
  lamp needs no resistor.
- Emergency stop connection at the chassis is like this:
  - 1 - switch - cable line white
  - 2 24V - cable line brown
  - 3 GND - cable line yellow
  - 4 3.3V cable line green

### Checks

- The second contact block must be **electrically separate** from the one wired to P2.12 (no shared common).
  Otherwise 24 V reaches a 3.3 V pin. Check with a meter: no continuity between the two blocks, pressed or released.
- The e-stop is still only a firmware halt (`kill_button`); it doesn't cut the 24 V motor supply. See the planned
  upgrade below.

### Planned upgrade: hardware e-stop with a relay (not done yet)

Planned 2026-10-07. Goal: the e-stop **cuts motor power in hardware**, and the firmware kill is a second layer.
Today a hung firmware or a failed driver/MOSFET could keep the motors moving with the e-stop pressed.

**Relay on hand:** Schrack RP310006 – 6 V DC coil, contacts 16 A 250 V AC. Coil resistance **measured 66 Ω**
(≈ 91 mA, 0.55 W at 6 V). Check the pin count first: 5 pins = 1 changeover (COM/NO/NC), which can switch both the
motor power and the LED; 4 pins = 1 NO only (then keep the FET LED circuit above).

Not a solid-state relay: SSRs usually fail shorted (the e-stop would silently stop working), AC-output SSRs never
turn off on DC, and they have only one pole.

```
Coil (6 V coil on 24 V through a series resistor):

+24V ── e-stop NC (block 1) ── R 220Ω 5W ──┬── coil 66Ω ──┬── GND
                                           └─────|◄───────┘
                                              1N4007 (cathode to the + side of the coil)

Contacts (1 changeover, both fed from +24 V):

PSU +24V ── COM
            NO ──► Smoothie VBB / motor power   (relay energized = e-stop released)
            NC ──► LED + R ──► GND              (relay released = e-stop pressed)
```

| R_series | Coil voltage at 24 V | Current | Resistor power |
|---|---|---|---|
| 200 Ω | 5.95 V | 90 mA | 1.6 W |
| **220 Ω (chosen)** | **5.54 V (92 %)** | **84 mA** | **1.55 W** |

- Use a **5 W** resistor (3 W runs hot), mounted away from plastic and wires. No 220 Ω: two 100 Ω ≥ 2 W in series.
- At 22 V supply the coil still gets ≈ 5.1 V, above the ≈ 4.2–4.5 V pull-in. 26 V gives ≈ 6 V.
- Diode across the **coil only**, not across resistor + coil.
- Fail-safe: e-stop pressed, a broken wire, an open resistor or a dead coil all drop the relay → motor power off.
- Cut on the **DC side** after the PSU (mains-side cut leaves the PSU capacitors powering the motors for a moment).
- With the relay's NC contact driving the LED, the FET LED circuit above can be removed. The LED then shows what
  the relay actually did.
- Releasing the e-stop re-powers the motors, but the Smoothie stays in its kill state until reset (`M999` / reset
  in OpenPnP), so nothing moves on its own.
- PCB relay pins: use a socket or a piece of perfboard, heatshrink every joint, motor-power wire sized for the
  VBB current.

**Alternative (preferred, 2026-10-08): 24 V DC contactor with 1NO + 1NC** instead of the Schrack relay. No series
resistor (24 V coil), DIN-rail mounting, and its contacts match the e-stop blocks already fitted – no new blocks
needed:

```
+24V ── e-stop NC block ── coil A1/A2 (24 V DC) ── GND    (+ diode/varistor across the coil)

PSU +24V ── NO ──► Smoothie VBB        (closed while the e-stop is released)
PSU +24V ── NC ──► LED + R ──► GND     (closed when the e-stop is pressed = LED on)

e-stop NO block ──► Smoothie kill input (as now)
```

- E-stop NC block: moves from the FET LED circuit to the contactor coil. The FET LED circuit can then be removed.
- E-stop NO block: stays on the Smoothie kill input, so the firmware still halts. Cutting only the power would
  leave the Smoothie running G-code with dead motors; on release the motors would come back at the wrong
  position. After an e-stop: `M999` and home.
- 1NO + 1NC rather than 2NO: one pole is plenty for a few amps at 24 V DC, and the NC contact drives the LED.
  (2NO would allow two poles in series for better DC breaking, but leaves no contact for the LED.)
- Check the contacts' **DC-1 rating at 24 V** covers the VBB current; most small contactors are rated for AC.
  Coil suppressor (diode or varistor) unless built in.
- Examples: Siemens 3RT2015-1BB41, Schneider LC1K0610BD (24 V DC coil) – check the auxiliary contact type.
- Same points as for the relay: separate 5 V for the Smoothie logic, fail-safe kill input later (list below).

**Do together with the relay:**

- [ ] **Smoothie logic on its own 5 V.** If the 5 V comes from VBB through the on-board regulator, cutting VBB
      reboots the board on every e-stop.
- [ ] **Fail-safe kill input.** Feed the Smoothie kill input from a **NC** contact (e-stop block 2): pin held low
      in normal running, pressed or a broken wire → pull-up takes it high → kill. Set the polarity with `^` / `!`
      in `kill_button_pin` and test both ways. Today the contact closes when pressed, so a broken wire goes
      unnoticed.
- [ ] **Move the kill input off P2.12** (the play-button pin, which makes the bootloader wait at power-up). With a
      NC contact P2.12 would be low all the time and the board might never boot. `smoothie-config.txt` suggests
      `2.11`; check it's free first. Then an e-stop pressed at power-up just boots into the kill state.
- [ ] This needs two NC blocks on the e-stop (relay coil + kill input). Today there's one NC and one NO; add a
      snap-on NC block, or feed the kill input from a spare relay contact.

---

## 11. Z probing (contact probe)

Status 2026-10-07: **probing works on the Smoothie side** (zprobe module added, bed test repeatable to 0.027 mm).
Still to do in OpenPnP: steps 7–9 of the procedure below. Originally **not working**; investigated from `smoothie-config.txt` and `machine.xml` in this folder
(the live SD card wasn't read; the copy is from 2026-10-05 19:12 and nothing probe-related changed since).

The machine is LitePlacer hardware: the nozzle holder is spring-loaded and a switch on the head trips when the
nozzle touches something. OpenPnP uses that to find the real Z of feeders, parts and the nozzle tip touch location.

### What's configured now

**OpenPnP (`machine.xml`) – already set up:**

| Setting | Value |
|---|---|
| Nozzle `N` class | `ContactProbeNozzle`, method `ContactSenseActuator` |
| Probe actuator | `N1PROBE` (Boolean, after-actuation coordination `WaitForUnconditionalCoordination`) |
| `ACTUATE_BOOLEAN_COMMAND` | `{True:G38.2 Z-42.0 F1500.0}` + `{True:M400}` (OpenPnP's own Smoothie suggestion: relative probe) |
| `ACTUATOR_READ_COMMAND` / regex | `M119` / `.*\(Z\)P1\.29:(?<Value>[01]).*` → the probe switch is expected on **P1.29** |
| Start offset / depth | 1.0 mm above nominal / 2.0 mm |
| Probe speed | 0.05 × Z 500 mm/s = 25 mm/s (`F1500`) |
| Feeder / part height probing | **AfterHoming** (was EachTime until 2026-10-07 14:30, see "Probing frequency" below) |
| Touch location (Z calibration) | N40 at (0.2, 22.0, **Z 0** – never probed); Z calibration trigger Manual |

**Smoothie (`config.txt`) – the missing part:**

- **There is no `zprobe` section.** `G38.2` belongs to the zprobe module, so Smoothie doesn't execute it.
- `return_error_on_unhandled_gcode false` hides that: Smoothie answers `ok`, nothing moves, OpenPnP reads the
  unchanged position with `M114` and takes the **start height (1 mm above nominal)** as the "contact". With
  feeder/part height probing on EachTime, picks can therefore happen too high. (Expected symptom, worked out from
  the OpenPnP source – not yet seen in a log.)
- **The probe switch is wired to P1.29** (Z-min endstop connector, confirmed by the user 2026-10-07). P1.29 is
  `gamma_min_endstop 1.29^!`. Z homes to max (`1.28`, top), so the Z-min input is free for the probe switch. All switches are NO to GND with pull-up, inverted (`^!`): 1 = pressed.

### Fix – what has to change

1. **Smoothie:** add the zprobe module on the probe switch pin (P1.29, same polarity as the endstop line):

   ```
   zprobe.enable                 true
   zprobe.probe_pin              1.29^!     # same pin and polarity as gamma_min_endstop; M119 checked 2026-10-07
   zprobe.slow_feedrate          5          # mm/s, used when G38.2 has no F
   zprobe.fast_feedrate          50         # mm/s
   zprobe.return_feedrate        25         # mm/s
   zprobe.debounce_count         100
   zprobe.probe_height           5          # only used by G32 leveling, not by G38.2
   ```

   `gamma_min_endstop 1.29^!` can stay: Z homes to max, so the endstop module doesn't act on that pin. If it ever
   interferes, set it to `nc` and switch the OpenPnP read regex to `Probe:` (step 6 below).
2. **OpenPnP probe command – slower and shorter.** 25 mm/s is fast for a spring-loaded switch, and `Z-42` drives
   the full Z travel if the switch never trips. Proposed:

   ```
   {True:G38.2 Z-10 F300 ; probe down 10 mm relative at 5 mm/s until the probe switch trips}
   {True:M400            ; wait until machine has stopped}
   ```

   10 mm covers start offset + depth (3 mm) plus a generous error. If the switch doesn't trip, Smoothie raises a
   probe-fail alarm and halts (`M999` to clear) – safer than a crash.
3. **Until probing works:** set feeder and part height probing to **Off** (Machine Setup → Nozzles → N →
   Contact Probe), so picks use the nominal heights instead of a fake "contact" 1 mm too high.

### Procedure – connect and bring up the probe

Send G-code from OpenPnP (Machine Setup → Drivers → GcodeDriver → Console), or close OpenPnP and use a serial
terminal on `/dev/ttyACM0`. Keep a hand on the e-stop for every move test.

1. **Check the switch and its polarity.** The switch is wired to the Z-min connector (P1.29), signal + GND.
   Home. Send `M119`. Push the nozzle up by hand (with a tip fitted) and send `M119` again. `(Z)P1.29` must
   change 0 → 1.
   - It doesn't change at all: check the switch and the head cable (meter across the switch while pushing).
   - **Done 2026-10-07:** pushed → `(Z)P1.29:1`, released → `(Z)P1.29:0`. Switch and wiring OK, polarity as in
     `gamma_min_endstop 1.29^!` → use `zprobe.probe_pin 1.29^!`.
   - It's 1 when released and 0 when pushed: the switch is NC. Use `1.29^` (no `!`) for the probe pin. That's
     actually the better choice: a broken wire then reads "contact" and probing stops instead of crashing.
2. **Edit `config.txt`** on the Smoothie SD card (as for the vacuum section, §8): add the `zprobe` block above.
   Run `sync`, unmount, reset the board.
3. **Check the module:** `M119` now also prints `Probe:`. It must follow the nozzle push like P1.29 did.
4. **Probe by hand, in the air:** jog the nozzle to ~15 mm above an empty part of the bed. Send
   `G38.2 Z-10 F300` and push the nozzle up with a finger while it moves down → it must stop at once. `M114` shows
   the stop Z. Repeat without touching → probe-fail alarm, clear with `M999`.
5. **Probe for real:** jog above a flat spot on the bed, ~5 mm high. `G38.2 Z-10 F300` → stops on the bed. Run it
   3–5 times from the same start: the `M114` Z values should agree within ≈ 0.05 mm.
   - **Done 2026-10-07:** Z −48.533, −48.527, −48.554 → spread 0.027 mm. OK.
6. **OpenPnP actuator:** change the `N1PROBE` `ACTUATE_BOOLEAN_COMMAND` to the slower command above. Optional: read
   regex `.*Probe:\s*(?<Value>[01]).*` instead of P1.29. Test the actuator read button with the nozzle pushed /
   released.
7. **Touch location + Z reference:** Machine Setup → Nozzle Tips → N40 → Tool Changer: set the **touch location**
   on a permanent, flat reference (near the changer, never moved). Use its probe button **once** to set the
   reference Z (later presses overwrite the "eternal" reference). Then run Z calibration; repeat per tip.
8. **Turn probing back on:** feeder height probing (start with EachTime on one feeder, watch the log), then part
   height probing. Pick from a strip and check the probed Z in the log is near the feeder's nominal Z.
9. Save the config and copy `machine.xml` and `config.txt` into this folder.

### Trigger delay: spring compression before the switch trips

Seen 2026-10-07: the switch doesn't trip when the tip first touches. The nozzle holder spring compresses first, then
the switch trips. So the probe stops **below** the real contact height, by a fixed amount *d* (spring travel +
switch pre-travel). That's normal for a spring-loaded LitePlacer head, as long as *d* is the same every time.

What it affects:

- **Z calibration of the tips:** not affected. The touch location and every tip are probed the same way, so *d*
  cancels out.
- **Feeder / part / placement heights:** the probed Z is *d* too low. The nozzle presses the part with the spring
  force before the switch trips, and learned part heights are off by *d*.

Measure *d* (paper method, ≈ 0.08–0.1 mm paper, same flat spot as the repeatability test):

1. Probe the spot: `G38.2 Z-10 F300`, then `M114` → **Z_trip**.
2. Jog up in 0.05 mm steps, sliding a strip of paper under the tip after each step. Note the Z where the paper
   first slides freely → **Z_contact** (subtract the paper thickness for the exact touch height).
3. *d* = Z_contact − Z_trip. Repeat 2–3 times.

Compensate in OpenPnP: Machine Setup → Nozzles → N → **Contact Probe** tab → **Final Adjustment = +d**
(`contact-probe-adjust-z`, now 0). OpenPnP adds it to the probed Z, so positive = up, back to the real contact.
If picks then become unreliable, reduce it a little so the tip still presses lightly on the part.

**Measured 2026-10-07: *d* = 5.894 mm** (bed spot from the repeatability test: trip ≈ Z −48.54, contact ≈ Z −42.64).
That's large: every probe pushes ≈ 6 mm into the spring before the switch trips. To do:

- [x] Repeat the measurement 2–3 times to confirm *d* is constant. **Done 2026-10-07: varies by < 0.1 mm** –
      good enough for this machine.
- [x] ~~Adjust the switch on the head so it trips after ≈ 0.5–1 mm~~ – **decided 2026-10-07: switch left as it
      is**, *d* is repeatable. Revisit only if small parts get pushed into the tape.
- [x] Set **Final Adjustment = +d**: 5.894 set in `machine.xml` 2026-10-07 (the GUI can't save it, §12). Change it
      again if the switch is adjusted.
- [ ] With *d* ≈ 6 mm, probing from 1 mm above nominal trips ≈ 7 mm lower, so `G38.2 Z-10` leaves only ≈ 3 mm
      margin. If the switch stays as it is, use `Z-12`, but only if the spring has that much travel left (check
      by hand that the nozzle doesn't bottom out before the switch trips).
- [x] Probe less often: feeder / placement height probing set to **AfterHoming** (2026-10-07), see below.

If *d* is large (≳ 0.5–1 mm) or the force is too high for small parts (0201/0402 pushed into the tape): adjust the
switch on the head so it trips earlier, then re-measure.

### Probing frequency: AfterHoming

Set 2026-10-07 in `machine.xml` (`feeder-height-probing` and `part-height-probing` on the `ContactProbeNozzle`),
edited with OpenPnP closed, because the Contact Probe tab can't save these fields (§12).

| Option | When it probes |
|---|---|
| Off | Never; nominal heights from the feeder and part settings |
| Once | First use of each feeder / part; the result is kept in `machine.xml`, also across restarts |
| **AfterHoming** (chosen) | First use of each feeder / part after each homing |
| EachTime | Every pick and every place (≈ 1.4 s per probe, ≈ 3 s per part, 6 mm spring push each time) |

- Homing doesn't probe anything. It only clears the stored heights. Each feeder is probed on its **first pick** of
  the session; later picks reuse the stored offset. Feeders the job doesn't use are never probed.
- Placement probing works the same per part type: first placement of each part after homing.
- OpenPnP quirk: placement probing repeats on every place whenever *feeder* probing is EachTime, so change both
  together.
- Feeders whose part height is unknown are always probed, whatever the setting.
- **No per-feeder on/off.** Workaround if a feeder must not be probed: use **Once** and put an entry with offset 0
  for that feeder in `<probed-feeder-height-offsets>` (OpenPnP closed) – it then always picks at its nominal
  height. Delete the entry to have it probed again. Only if a feeder actually has trouble with probing.

---

## 12. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Op-amp output stuck at 3.3 V at atmosphere | Divider not working (R1 missing or wrong – this happened during the build) |
| VOUT doesn't follow VIN+ | Wrong MCP6001 variant (plain or R instead of U), or VIN− not tied to VOUT |
| Machine HALTs after boot | `max_temp` missing or below 660 in the `vacuum` section |
| AVACS reads nothing / error | Regex doesn't match: set driver log level to TRACE and check the `M105` reply. Or Smoothie not reset after editing `config.txt` |
| Reading doesn't change | Wrong ADC pin in config, sensor pins 1/5–8 connected, sensor 5 V missing |
| Same reading with tip open and blocked | Restriction between pump and line missing or too wide |
| Reading stuck at ~3.3 V (≈ 660) | Divider R2 missing, or sensor output disconnected |
| Reading stuck near 0 V | Sensor 5 V missing, R1 open, or op-amp not powered |
| Noisy reading | Missing C4/C5, pump/valve/motor current in the sensor ground wire, cable next to stepper cables |
| Reading drifts over time | 5 V not stable (USB power), sensor warming up |
| Output oscillates (check with a scope) | R3 missing or shorted |
| Vacuum builds too slowly / weak pick | Restriction too narrow; leaks in tubing |
| Op-amp or Smoothie dead after rework | Check the VBB/3.3V/GND connector wiring – VBB on the 3.3 V wire |
| Smoothie gives no serial port (`ttyACM0`) and no SD drive; PC log shows `Product: Smoothie`, `Manufacturer: SmoothieWare`, `bcdDevice 0.40` instead of `Smoothieboard` / `Uberclock` | Board waiting in its bootloader. **Most likely cause: e-stop pressed at power-up.** The e-stop is on `kill_button_pin 2.12`, the same pin as the board's play button, which (probably) makes the bootloader wait. The e-stop LED (§10) is lit when it's pressed. Release the e-stop and reset / power-cycle. If it still stays in the bootloader: copy `FIRMWARE.CUR` to `firmware.bin` on the SD card to reflash (2026-10-05) |
| Contact Probe tab (Nozzles → N): Final Adjustment, Feeder/Placement Height Probing, Discard Probing or Calibration Z Offset don't stick after Apply + Save; log shows `UnsupportedOperationException: Unwritable` at `JBindings$WrappedBinding.save` | **OpenPnP bug** in the installed build: `sniffleDwellTime` has a `long` getter but an `int` setter, so its binding is unwritable. Apply saves the fields in order and stops at that one, so every field after it is lost. Workaround: close OpenPnP (it saves on exit), back up `machine.xml`, edit the `ContactProbeNozzle` values there (e.g. `<contact-probe-adjust-z value="…">`), restart (2026-10-07) |
| PC says the Smoothie SD card "was not properly unmounted" | The card's FAT dirty flag. Close OpenPnP, `udisksctl unmount -b /dev/sdb1`, `sudo fsck.vfat -a /dev/sdb1`, reset the board. After editing `config.txt` run `sync` before resetting |

---

## 13. Change log – what was changed on the machine

| Date | Change | Undo / backup |
|---|---|---|
| 2026-09-29 | Backup of `~/.openpnp2` | `~/openpnp2-backup-2026-09-29-1156.tgz` |
| 2026-09-29 | `machine.xml`: AVACS → Double, driver assigned, M105 read command and regex | `~/.openpnp2/machine.xml.before-vacsense` |
| 2026-09-29 | `config.txt` (Smoothie SD): `temperature_control.vacuum` section on 0.23 (done by hand) | – |
| 2026-09 | Bottom camera remounted higher; red LEDs replaced by white | – |
| 2026-09 | Vacuum sensor board built and connected; restriction tube fitted between pump and line | – |
| 2026-09/10 | Bottom camera `BOTTOM` added; Advanced Camera Calibration enabled (RMS 3.99 px) | `~/.openpnp2/backups/` |
| 2026-09/10 | Nozzle tips N40, N14, N24, N400, N750 added (NT1 renamed N045); automatic tip changer locations set | `~/.openpnp2/backups/` |
| 2026-09/10 | Test feeders removed except `Upper Strips - 1` (R0603-1K); parts R0201/R0402/R0603/R0805-1K added | `~/.openpnp2/backups/` |
| 2026-09/10 | Head pump control set to PartOn (pump switched for each pick) | `~/.openpnp2/backups/` |
| 2026-10-05 | Vision debug folder `ImageWriteDebug` removed | – |
| 2026-10-05 | Vacuum reading problem ("No part detected", reading ≈ 610) fixed by the user | – |
| 2026-10-05 | Reference copy of `machine.xml` added to this folder | – |
| 2026-10-05 | X/Y current tried at 1.2 A (soft clicking at standstill after enable) and 0.9 A (jerky, lost the fiducial at the slowest test step). Back to 0.5 / 0.6 A | `smoothie-config.txt` in this folder = known-good config (0.5 / 0.6 A) |
| 2026-10-05 | Smoothie stuck in bootloader after a reset; e-stop was pressed. Released → boots normally | – |
| 2026-10-05 19:23 | Issues & Solutions "up-looking camera BOTTOM position and initial calibration": BOTTOM Z −7.80 → −6.75 mm, offsets (−44.154, 95.810) → (−43.838, 95.835), units per pixel ≈ +3 %, N40 vision diameter 0.80 → 0.78 | `machine.xml` 19:15 copy in this folder has the old values |
| 2026-10-05 19:34 | TOP CAMERA Advanced Camera Calibration enabled (RMS 1.89 px) | – |
| 2026-10-05 ~20:00 | BOTTOM Advanced Calibration **switched off**: its data was from the old Z −7.8 and no longer matched the new position → nozzle off the crosshair, N40 calibration failed after homing (0.77 mm > 0.5 mm). Off → nozzle calibration works | Re-enable only after a fresh calibration |
| 2026-10-05 | Speed tests (`scripts/Speed_Test.js`): lost steps above 250 mm/s and at 3000 mm/s². Set X/Y to 200 mm/s, 1200 mm/s² in OpenPnP; Smoothie `x/y_axis_max_speed 15000`, `acceleration 1200` | OpenPnP x/y were 15000 mm/s, 1500 mm/s²; Smoothie 20000 / 2500 |
| 2026-10-07 14:30 | `machine.xml`: nozzle N feeder and placement height probing EachTime → **AfterHoming**, edited in the file with OpenPnP closed. Copy in this folder updated (also has the nozzle tip changes made in the GUI since 10:41) | `~/.openpnp2/machine.xml.before-probe-afterhoming-20261007-1430` |
| 2026-10-07 10:41 | `machine.xml`: nozzle N `contact-probe-adjust-z` (Final Adjustment) 0 → **5.894 mm**, edited in the file with OpenPnP closed (GUI Apply bug, see §12). N40 touch location (−17.8, 211.0, Z −18.02), Z calibration trigger NozzleTipChange (set in the GUI). Copy in this folder updated | `~/.openpnp2/machine.xml.before-probe-adjust-20261007-1041` |
| 2026-10-07 | Z probing: `zprobe` module added to Smoothie `config.txt` (`zprobe.probe_pin 1.29^!`, §11). `N1PROBE` command changed to `G38.2 Z-10 F300` (was `Z-42 F1500`). Bed probe test: −48.533 / −48.527 / −48.554 | Remove the `zprobe` lines; old command in the 2026-10-05 `machine.xml` copy |
| 2026-10-07 | E-stop indicator LED added: second NC contact block + FDN337N, 100k/33k gate divider (§10). Smoothie signal line untouched | Remove the LED board; nothing else changed |

---

## 14. Open items

### Next session (2026-10-06): bottom camera Advanced Calibration

**Update 2026-10-07 18:41: new BOTTOM Advanced Calibration done – RMS 1.74 px** (11 of 535 points removed as
outliers; 3.75 px before outlier removal). Two heights, 32 radial lines, about 14–15 steps each; the walk lost the
tip once near the edge (1 of 15 allowed errors). Detection on the outer diameter of the tip end face (46 px ≈ 2.2 mm),
camera settings unchanged (exposure 120, contrast 128, fill fraction 0.9). Still to do: check **Enabled**, save the
config, home, N40 nozzle tip calibration, copy `machine.xml` here.

Status on 2026-10-05: BOTTOM Advanced Calibration is **off**. The old data (Z −7.8, RMS 3.99 px) didn't match the
camera's new position after the Issues & Solutions "camera position" step, and a new run with N40 misdetected the
nozzle at the later test points (image edges and the second height). Nozzle tip calibration works with it off.

Before starting:

- [ ] Bottom camera lighting and exposure final (§5): auto exposure / gain / white balance off, tip end bright but
      not blown out, light even towards the image edges. Calibration depends on the image, so do this first.
- [ ] Clean the nozzle tip face (flux and dust make the circle irregular).

Calibration with a larger tip:

- [ ] Change to a **larger tip with a clean, round end** through OpenPnP (tip changer or manual nozzle tip change),
      so OpenPnP knows which tip is on. The camera calibration applies to all tips, so any tip will do.
- [ ] Measure the tip's end diameter with calipers and set it as the **detection diameter** in the calibration
      settings. It's still set for N40 (0.78 mm) from the Issues & Solutions step.
- [ ] Advanced Calibration tab: **test pattern fill fraction 0.9 → 0.6–0.7** (keeps the points away from the dark,
      distorted corners). Put the **secondary Z closer to the primary Z** (less defocus).
- [ ] Run Machine Setup → Cameras → BOTTOM → Advanced Calibration. Watch the detections: a few misses are discarded
      as outliers, but not many.
- [ ] Result: **RMS ≲ 2 px** (top camera: 1.89 px). Check that the calibration is **enabled** afterwards.
- [ ] **Don't** run the Issues & Solutions "camera position" step afterwards. It moves the camera position again
      and breaks the match (that's what happened on 2026-10-05).

Afterwards:

- [ ] Put **N40** back on (through OpenPnP) and run its **nozzle tip calibration**. Repeat for every other tip in use;
      each tip needs its own runout calibration.
- [ ] **Home**, and check that the N40 calibration passes straight after homing (that's what failed on 2026-10-05:
      0.77 mm offset, limit 0.5 mm). Check the nozzle sits in the crosshair centre.
- [ ] If the result is poor (RMS well above 2 px, nozzle off-centre, calibration fails after homing):
      **switch Advanced Calibration off again before saving**, so the saved config stays in the working state.
- [ ] **Save the configuration**, then copy `machine.xml` into this folder (or ask Claude to check the result and
      copy it): `scp tdarlic@192.168.0.185:.openpnp2/machine.xml .`
- [ ] Fallback: the 19:15 `machine.xml` copy in this folder has the bottom camera as it was before 2026-10-05 19:23.
      With OpenPnP closed, the BOTTOM camera section can be restored from it.

### Other open items

- [x] ~~Actuators without a driver~~: PUMP, AVAC, LIGHT_TOP and LIGHT_BOTTOM still have no `driver-id`, but the
      log (2026-10-05) shows their G-code is sent. Nothing to fix. Optionally assign the GcodeDriver for tidiness.
- [x] Bottom camera added, Advanced Camera Calibration enabled, nozzle tip calibration running (N40).
- [x] **Bottom camera Advanced Calibration redone 2026-10-07: RMS 1.74 px** in the log (the saved
      `rms-error` shows 2.46 px – OpenPnP stores a differently computed value). Enabled and saved 19:41, nozzle
      tip calibration passes.
- [ ] **Replace the top (head) camera**: Logitech C270 → new ULP camera (ordered 2026-10-08). When it arrives:
  1. Before swapping: save the config and back up `~/.openpnp2` (the C270 settings stay in the backup).
  2. Mount it on the head, lens square to the bed (the top camera's tilt matters as much as the bottom one's).
  3. Machine Setup → Cameras → TOP CAMERA: select the new device (the `unique-id` changes from
     `UVC Camera (046d:0825)`), pick a resolution/format (MJPEG for high resolutions), turn **off** auto
     exposure, auto white balance and autofocus (if it has one), set focus at the board height.
  4. Redo in this order: camera head offset and units per pixel (Issues & Solutions), **TOP CAMERA Advanced
     Camera Calibration**, then nozzle head offset to the camera (§1: currently X −106.55, Y −35.47), the
     nozzle tip touch locations if they were set with the camera, fiducial / feeder vision checks.
  5. Check the top light: brightness and exposure as for the bottom camera (§5).
  6. Update the camera table in §1, copy `machine.xml` here.
- [ ] **Square up the bottom camera mount** (the mount can be adjusted in all axes). The 2026-10-07 calibration
      measured a tilt of **7.0° around Y** and **3.1° around X** (rotation around Z −0.2°, fine); 2026-10-05 was
      3.3° / 2.5°. OpenPnP corrects it, but a large tilt costs resolution and makes the correction strong.
  1. Advanced Calibration: **untick Enabled** (the corrected image hides the tilt), Apply.
  2. Load a tip, centre it over the camera at the calibration height. Move Z up/down by 5 mm: the tip should
     stay at the same spot in the image. At ≈ 0.047 mm/px, a 7° tilt moves it ≈ 0.6 mm ≈ 13 px per 5 mm of Z.
  3. Tilt the mount against the direction the tip moves, repeat until the shift is ≲ 1–2 px (≈ 1°). Keep the
     camera's Z rotation and focus as they are, tighten, re-check.
  4. Re-run Advanced Calibration (outer diameter of the tip end face, fill fraction 0.6–0.7). Expect rotation
     errors ≲ 1° in `machine.xml`. **Don't** run the Issues & Solutions "camera position" step afterwards.
  5. Enable it, save, home, nozzle tip calibration for each tip, copy `machine.xml` here.
- [x] Top camera Advanced Camera Calibration done and enabled (2026-10-05 19:34, RMS 1.89 px).
- [ ] Set the bottom camera exposure and lighting (§5), then recalibrate.
- [ ] Part detection: set up N045 properly (its method is Difference with no limits). Measure N40 empty and with
      a part, then lower its Part On high limit (590). Set up the other tips. Test with a pick from an empty slot.
- [ ] Confirm what `M800` does to AVAC: does it close the vent? OpenPnP has it on while holding a part.
- [ ] Decide whether the pump runs constantly or is switched for each pick. If switched, set a pump-on wait (§7).
- [ ] Re-copy `machine.xml` into this folder after closing OpenPnP, so the vacuum fix from 2026-10-05 is included.
- [ ] Merge the rest of the v1 `parts.xml` / `packages.xml` into `~/.openpnp2` (only 6 parts so far).
- [ ] Recreate the 15 production strip feeders (table in §2). Only `Upper Strips - 1` exists.
- [ ] Check that the Smoothie 5 V rail isn't fed only from USB.
- [x] E-stop indicator LED – done 2026-10-07, see §10.
- [x] Z probing on Smoothie (2026-10-07): `zprobe` module on P1.29 added, `G38.2` tested, repeatable to 0.027 mm.
- [x] Z probe trigger delay: *d* = **5.894 mm**, repeatable to < 0.1 mm (2026-10-07). Switch left as it is, Final
      Adjustment set to 5.894 in `machine.xml`. Tip Z calibrations now within ±0.06 mm. Details in §11.
- [ ] Z probing in OpenPnP: touch location + Z reference, Z calibration per tip, feeder/part height probing back
      on and checked in the log, then copy `machine.xml` and `config.txt` here (§11 steps 7–9).
- [ ] Hardware e-stop: relay (Schrack RP310006, 220 Ω 5 W coil resistor) cutting motor 24 V, fail-safe NC kill
      input moved off P2.12, Smoothie logic on its own 5 V. Plan and checklist in §10.
- [x] **Lost steps at 100 % speed** – **solved 2026-10-05**, settings applied at 19:10 (see the end of this item) (fine at 80 %, which also means 64 % acceleration – OpenPnP scales acceleration
      by speed²). X/Y motors are 17HM19-2004S (0.9°, 2.0 A) but run at 0.5 / 0.6 A (`alpha/beta_current`).
      Raise the current, then run `scripts/Speed_Test.js` (copy to `~/.openpnp2/scripts/`). It steps up feed rate
      and acceleration and checks the homing fiducial after each step. Set the axis limits from the result.
      Also: 333 mm/s × 320 steps/mm ≈ 107 kHz, which is above `base_stepping_frequency 100000`.
      Status 2026-10-05: more current made it *worse* (1.2 A clicking at standstill, 0.9 A large lost steps even at
      100 mm/s / 500 mm/s²). Not the supply (Artesyn LCM600Q, 24 V 23 A) and not driver heat (heatsinks fitted).
      Still to check: motor connectors and wiring, the board. At 0.5 / 0.6 A, Y drifted ≈ 0.02 mm per test step at
      every speed → check the Y pulley grub screws and belt tension. Next: baseline speed test at 0.5 / 0.6 A.
      **Finding 2026-10-05 18:33:** the speed test moves at 100 mm/s were fine, but the move back to the fiducial at
      the normal limits (`F29743` requested → Smoothie cap 333 mm/s, only 781 mm/s²) lost so many steps that the
      fiducial was out of view. So **top speed is the problem, not acceleration**: OpenPnP X/Y feed rate is
      15000 mm/s (= unlimited), so every long move runs at Smoothie's 333 mm/s (≈ 500 rpm, ≈ 107 kHz step rate).
      The 0.9 A run failed the same way, so it doesn't prove that more current is worse. Fix: limit the X/Y feed rate
      in OpenPnP (Machine Setup → Axes → x / y → Feed Rate [/s]) to what the speed test shows is safe.
      **Speed test 2026-10-05 18:38** (0.5 / 0.6 A, 1000 mm/s², `speed-test-2026-10-05_1838.csv`): 100, 150, 200
      and 250 mm/s all OK (shift ≤ 0.02 mm = noise, Y drift gone); 300 mm/s lost steps badly (fiducial lost).
      → Set X/Y feed rate **200 mm/s** in OpenPnP and `x/y_axis_max_speed 15000` (250 mm/s) in Smoothie.
      **Acceleration test 2026-10-05 18:52** (200 mm/s, `speed-test-2026-10-05_1852.csv`): 1000, 1500, 2000 mm/s²
      OK (≤ 0.02 mm); 3000 mm/s² lost steps in the first cycle (Y +4.0 mm, X −0.7 mm).
      → Chosen settings: **X/Y 200 mm/s, 1200 mm/s²** (60 % of the last good acceleration).
      OpenPnP: x / y Feed Rate [/s] 200, Acceleration [/s²] 1200. Smoothie: `x/y_axis_max_speed 15000`,
      `acceleration 1200` (used for moves OpenPnP doesn't send an M204 with, e.g. manual G-code).
      **Confirmed 2026-10-05 19:00** (`speed-test-2026-10-05_1900.csv`): 10 cycles at 200 mm/s / 1200 mm/s², total
      shift 0.022 mm (= noise) → no lost steps. **Applied 19:10:** OpenPnP x / y 200 mm/s, 1200 mm/s²; Smoothie
      `x/y_axis_max_speed 15000`, `acceleration 1200`. Copies in this folder: `machine.xml`, `smoothie-config.txt`.
      Optional later: re-test 250/300 mm/s at 0.9 A to confirm the step-rate limit, and the 0.9 A stuttering.
- [x] ~~X/Y low soft limits were switched off~~ (seen in the 18:25 save) – turned back on, saved 19:15.
      **Most likely cause of the 300 mm/s limit: Smoothie's step rate.** `base_stepping_frequency 100000` is the
      Smoothieware default and "the only officially supported value" (smoothieware.org/configuration-options).
      Step pulses are derived from that 10 µs tick by integer division, so the max step rate per motor is
      100000 / 320 = **312 mm/s**, and close to it the step timing becomes very uneven (300 mm/s = 96 kHz).
      Smoothie's `x/y_axis_max_speed 20000` (333 mm/s) is above what it can step. Torque is less likely: X/Y run
      at only ≈ 450 rpm at 300 mm/s (0.9°, 1/32 microstepping, 40 mm/rev). A re-test of 250/300 mm/s at 0.9 A
      would confirm: if 300 still fails, it's the step rate. Going faster needs fewer steps/mm (1.8° motors →
      160 steps/mm → 625 mm/s max), not more current.
- [ ] Optional: `ssh-copy-id tdarlic@192.168.0.185` for password-free access (still no key installed).
- [x] ~~Delete the big vision debug image folder~~: `ImageWriteDebug` is gone. `VisionSolutions` is now 1.7 GB;
      exclude it from backups or clean it up.

---

## 15. References

- Vacuum sensor PCB document: `vacuum-sensor.md` (GitHub vacuum sensor PCB project)
- Reference copy of the OpenPnP machine config: `machine.xml` (this folder; live file is `~/.openpnp2/machine.xml`)
- OpenPnP 2.0 upgrade notes: `/opt/openpnp/OPENPNP_2_0.md` on the PnP PC
- OpenPnP wiki – Contact Probing Nozzle: <https://github.com/openpnp/openpnp/wiki/Contact-Probing-Nozzle>
- Smoothieware – zprobe module (config, G30, G38.x): <https://smoothieware.org/zprobe>
- OpenPnP wiki – Vacuum Sensing: <https://github.com/openpnp/openpnp/wiki/Setup-and-Calibration_Vacuum-Sensing>
- Smoothieware temperature control (incl. AD8495 section): <https://smoothieware.org/temperaturecontrol>
- Microchip MCP6001/1R/1U/2/4 datasheet (DS20001733L):
  <https://ww1.microchip.com/downloads/en/DeviceDoc/MCP6001-1R-1U-2-4-1-MHz-Low-Power-Op-Amp-DS20001733L.pdf>
- Microchip MCP6006/6R/6U/7/9 datasheet (MCP6007 alternative):
  <https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP6006-6R-6U-7-9-Data-Sheet-20006411B.pdf>
- Freescale/NXP MPXV6115V datasheet (Rev 3): <https://docs.rs-online.com/6ca8/0900766b810bd3f3.pdf>
- ST datasheet for MPXV6115V6 / MPXV6115VC6 (second source): <https://www.st.com/resource/en/datasheet/mpxv6115v6.pdf>
