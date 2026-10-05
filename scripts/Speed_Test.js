/**
 * Speed_Test.js – find the X/Y speed and acceleration at which the machine starts losing steps.
 *
 * For each step in STEPS (slow → fast) the script, CYCLES times:
 *   1. sets the X and Y axis feed rate and acceleration to the step's values,
 *   2. runs one cycle of the move pattern with the top camera (long moves, diagonals, short zig-zags),
 *   3. measures the homing fiducial with the top camera, moving there at slow, safe limits (SAFE_FEED / SAFE_ACCEL),
 *   4. compares the result with the previous measurement.
 * It stops as soon as the fiducial has moved by more than LIMIT_MM in one cycle (= lost steps), so a position error
 * can't build up far enough to reach a limit switch, and always restores the original axis limits at the end.
 *
 * Install: copy to ~/.openpnp2/scripts/ and use Scripts → Refresh Scripts, then Scripts → Speed_Test.
 * Before running: home the machine (visual homing), nothing on the nozzle, bed area clear.
 * Results go to the OpenPnP log (Log tab, filter "SpeedTest") and to ~/.openpnp2/speed-test-<date>.csv.
 *
 * Note: Smoothie caps X/Y speed at x/y_axis_max_speed (20000 mm/min = 333 mm/s in config.txt), so feed rates
 * above that are not reached unless config.txt is changed. OpenPnP sends the acceleration with M204 for every
 * move, so the acceleration values here are what the motors really get.
 */

// ---------------------------------------------------------------- settings (edit these)

// [feed rate mm/s, acceleration mm/s²], slowest first. The test stops at the first step that loses steps.
// Run 1 (2026-10-05, 0.5/0.6 A): speed ladder at 1000 mm/s² → OK up to 250 mm/s, lost steps at 300 mm/s.
// var STEPS = [[100, 1000], [150, 1000], [200, 1000], [250, 1000], [300, 1000], [333, 1000]];
//
// Run 2 (2026-10-05, 0.5/0.6 A): acceleration ladder at 200 mm/s → OK up to 2000 mm/s², lost steps at 3000
// (Y +4.0 mm, X −0.7 mm in the first cycle).
// var STEPS = [[200, 1000], [200, 1500], [200, 2000], [200, 3000], [200, 4000], [200, 5000]];
//
// Run 3 (default now): long confirmation run at the chosen settings. Use CYCLES = 10 or more.
var STEPS = [
    [200, 1200]
];

// Slow, known-safe limits used for the fiducial checks and the baseline, so that only the test moves are fast.
var SAFE_FEED = 100, SAFE_ACCEL = 500;

var CYCLES = 10;         // repetitions of the move pattern per step (3 ≈ 15 min to find the limit, 10+ to confirm)
var LIMIT_MM = 0.04;    // fiducial shift that counts as lost steps. One full step on X/Y = 0.1 mm
                        // (0.9° motor, 1/32 microstepping, 320 microsteps/mm = 40 mm/rev), a stalled motor
                        // usually slips 4 full steps = 0.4 mm.
                        // Should be above the measurement noise, which the script measures first.
var DRIFT_WARN_MM = 0.10;   // total shift from the baseline that is reported as slow drift (mechanics, not speed)
var BASELINE_REPEATS = 3;   // fiducial measurements at normal limits before the test, to measure the noise

// Test area in top-camera coordinates (mm). Travel is X 0…570, Y 0…373 (limit switches at the ends).
// Keep a wide margin: after lost steps the real position is off, and a move to the edge of the area could
// otherwise run into a limit switch. The fiducial is checked after every cycle to catch that early.
var X_MIN = 100, X_MAX = 470;
var Y_MIN = 80, Y_MAX = 300;
var ZIGZAG_MM = 10;     // length of the short moves (these stress acceleration most)
var ZIGZAG_COUNT = 10;

// ---------------------------------------------------------------- script

var imports = new JavaImporter(org.openpnp.model, org.openpnp.util, org.openpnp.gui.support, java.io, java.text,
    java.util);

with (imports) {
    var Logger = Packages.org.pmw.tinylog.Logger;
    var mm = LengthUnit.Millimeters;

    function log(msg) {
        Logger.info("SpeedTest: " + msg);
        print("SpeedTest: " + msg);
    }

    function findAxis(name) {
        var axes = machine.getAxes();
        for (var i = 0; i < axes.size(); i++) {
            if (axes.get(i).getName() == name) {
                return axes.get(i);
            }
        }
        throw new Error("Axis '" + name + "' not found");
    }

    function fmt(v, d) {
        return Number(v).toFixed(d);
    }

    function run() {
        var head = machine.getDefaultHead();
        var camera = head.getDefaultCamera();
        var fidPart = config.getPart("FIDUCIAL-HOME");
        var nominal = head.getHomingFiducialLocation().convertToUnits(mm);
        var axisX = findAxis("x");
        var axisY = findAxis("y");

        if (!machine.isEnabled() || !machine.isHomed()) {
            throw new Error("Enable and home the machine first.");
        }
        if (fidPart == null) {
            throw new Error("Part FIDUCIAL-HOME is missing.");
        }

        var orig = {
            xF: axisX.getFeedratePerSecond(), xA: axisX.getAccelerationPerSecond2(),
            yF: axisY.getFeedratePerSecond(), yA: axisY.getAccelerationPerSecond2()
        };
        log("original limits X " + orig.xF + " / " + orig.xA + ", Y " + orig.yF + " / " + orig.yA);

        function setLimits(feed, accel) {
            axisX.setFeedratePerSecond(new Length(feed, mm));
            axisX.setAccelerationPerSecond2(new Length(accel, mm));
            axisY.setFeedratePerSecond(new Length(feed, mm));
            axisY.setAccelerationPerSecond2(new Length(accel, mm));
        }

        function restoreLimits() {
            axisX.setFeedratePerSecond(orig.xF);
            axisX.setAccelerationPerSecond2(orig.xA);
            axisY.setFeedratePerSecond(orig.yF);
            axisY.setAccelerationPerSecond2(orig.yA);
        }

        // Measure the homing fiducial. The moves to it run at SAFE_FEED / SAFE_ACCEL: the machine's normal limits
        // may themselves lose steps on the way back to the fiducial.
        function measure() {
            setLimits(SAFE_FEED, SAFE_ACCEL);
            var found = machine.getFiducialLocator().getHomeFiducialLocation(nominal, fidPart);
            if (found == null) {
                throw new Error("Homing fiducial not found – lost steps are probably larger than the search area. "
                    + "Re-home the machine.");
            }
            return found.convertToUnits(mm);
        }

        function move(x, y) {
            camera.moveTo(new Location(mm, x, y, Number.NaN, Number.NaN), 1.0);
        }

        // Wait until the machine has stopped. Called after each group of moves: OpenPnP's driver times out
        // (60 s) if it has to wait for a long queue of moves to finish in one go.
        function settle() {
            camera.waitForCompletion(Packages.org.openpnp.spi.MotionPlanner.CompletionType.WaitForStillstand);
        }

        // One cycle of the move pattern.
        function cycle() {
            var xm = (X_MIN + X_MAX) / 2, ym = (Y_MIN + Y_MAX) / 2;
            // Long moves: reach full speed.
            move(X_MIN, ym); move(X_MAX, ym); move(X_MIN, ym);
            settle();
            move(xm, Y_MIN); move(xm, Y_MAX); move(xm, Y_MIN);
            settle();
            // Diagonals: both motors at once.
            move(X_MIN, Y_MIN); move(X_MAX, Y_MAX);
            move(X_MIN, Y_MAX); move(X_MAX, Y_MIN);
            settle();
            // Short zig-zags: mostly acceleration.
            move(xm, ym);
            for (var z = 0; z < ZIGZAG_COUNT; z++) {
                move(xm + ZIGZAG_MM, ym);
                move(xm, ym + ZIGZAG_MM);
                move(xm - ZIGZAG_MM, ym);
                move(xm, ym - ZIGZAG_MM);
            }
            move(xm, ym);
            settle();
        }

        var stamp = new SimpleDateFormat("yyyy-MM-dd_HHmm").format(new Date());
        var csvFile = new File(Configuration.get().getConfigurationDirectory(), "speed-test-" + stamp + ".csv");
        var csv = new PrintWriter(new FileWriter(csvFile));
        csv.println("step,feed_mm_s,accel_mm_s2,step_dx_mm,step_dy_mm,step_shift_mm,total_dx_mm,total_dy_mm,total_shift_mm,result");

        var summary = [];
        var noise = 0;
        var lastGood = null;
        var error = null;
        try {
            setLimits(SAFE_FEED, SAFE_ACCEL);
            head.moveToSafeZ();
            // Baseline: measure several times at the safe limits, moving away and back in between, to see how
            // repeatable the measurement itself is. The average is the reference for the test steps.
            var bx = [], by = [];
            for (var r = 0; r < BASELINE_REPEATS; r++) {
                move(nominal.getX() + 50, nominal.getY() + 50);
                var b = measure();
                bx.push(b.getX());
                by.push(b.getY());
            }
            var avg = function(a) { var s = 0; for (var k = 0; k < a.length; k++) s += a[k]; return s / a.length; };
            var spread = function(a) { return Math.max.apply(null, a) - Math.min.apply(null, a); };
            var base = new Location(mm, avg(bx), avg(by), 0, 0);
            var prev = base;
            noise = Math.max(spread(bx), spread(by));
            log("baseline fiducial " + fmt(base.getX(), 3) + ", " + fmt(base.getY(), 3)
                + " (nominal " + fmt(nominal.getX(), 3) + ", " + fmt(nominal.getY(), 3) + "), measurement spread "
                + fmt(noise, 3) + " mm over " + BASELINE_REPEATS + " repeats");
            csv.println("0,baseline,,0,0," + fmt(noise, 4) + ",0,0,0,spread");
            // Typical spread on this machine is 0.01–0.02 mm (2026-10-05).
            if (noise > LIMIT_MM * 0.75) {
                throw new Error("Fiducial measurement spread " + fmt(noise, 3) + " mm is too large for LIMIT_MM "
                    + LIMIT_MM + " mm. Check the homing fiducial, the top camera focus and lighting.");
            }

            for (var i = 0; i < STEPS.length; i++) {
                var feed = STEPS[i][0], accel = STEPS[i][1];
                log("step " + (i + 1) + "/" + STEPS.length + ": " + feed + " mm/s, " + accel + " mm/s², "
                    + CYCLES + " cycles");
                // Check the fiducial after every cycle, so lost steps are caught before the position error can
                // grow large enough to reach a limit switch.
                var ok = true, found, sx, sy, stepShift, dx, dy, shift;
                var stepStart = prev;
                for (var c = 0; c < CYCLES && ok; c++) {
                    setLimits(feed, accel);
                    cycle();
                    found = measure();
                    sx = found.getX() - prev.getX();
                    sy = found.getY() - prev.getY();
                    ok = Math.sqrt(sx * sx + sy * sy) <= LIMIT_MM;
                    prev = found;
                    if (!ok) {
                        log("lost steps in cycle " + (c + 1) + ": dX " + fmt(sx, 3) + " dY " + fmt(sy, 3));
                    }
                }
                // Lost steps at this speed show up as a jump during a cycle. A steady creep that is the same at every
                // speed is a mechanical problem (pulley grub screw, belt), reported as drift from the baseline.
                sx = found.getX() - stepStart.getX();
                sy = found.getY() - stepStart.getY();
                stepShift = Math.sqrt(sx * sx + sy * sy);
                dx = found.getX() - base.getX();
                dy = found.getY() - base.getY();
                shift = Math.sqrt(dx * dx + dy * dy);
                var drift = shift > DRIFT_WARN_MM;
                var line = feed + " mm/s, " + accel + " mm/s²: this step dX " + fmt(sx, 3) + " dY " + fmt(sy, 3)
                    + ", total dX " + fmt(dx, 3) + " dY " + fmt(dy, 3)
                    + " → " + (ok ? "OK" : "LOST STEPS") + (drift ? " (total drift above " + DRIFT_WARN_MM + " mm)" : "");
                log(line);
                summary.push(line);
                csv.println((i + 1) + "," + feed + "," + accel + "," + fmt(sx, 4) + "," + fmt(sy, 4) + ","
                    + fmt(stepShift, 4) + "," + fmt(dx, 4) + "," + fmt(dy, 4) + "," + fmt(shift, 4) + ","
                    + (ok ? "ok" : "lost") + (drift ? " drift" : ""));
                csv.flush();
                if (!ok) {
                    break;
                }
                lastGood = STEPS[i];
            }
        }
        catch (e) {
            // Keep the results so far and report the error in the summary instead of losing everything.
            error = e;
            log("stopped by error: " + e);
        }
        finally {
            restoreLimits();
            csv.close();
        }

        var msg = "Measurement spread: " + fmt(noise, 3) + " mm (limit " + LIMIT_MM + " mm)\n\n"
            + summary.join("\n") + "\n\n";
        if (error != null) {
            msg += "STOPPED BY ERROR: " + error + "\n"
                + (lastGood == null ? "No step completed." : "Last good step: " + lastGood[0] + " mm/s, "
                    + lastGood[1] + " mm/s².") + "\nRe-home the machine before running again.";
        }
        else if (lastGood == null) {
            msg += "Lost steps already at the first step.";
        }
        else if (lastGood == STEPS[STEPS.length - 1]) {
            msg += "No lost steps up to " + lastGood[0] + " mm/s, " + lastGood[1] + " mm/s². Add faster steps to "
                + "find the limit.";
        }
        else {
            msg += "Last good step: " + lastGood[0] + " mm/s, " + lastGood[1] + " mm/s².\n"
                + "Suggested setting: about 70 % of that speed and 60 % of that acceleration,\n"
                + "then confirm with a long run.";
        }
        msg += "\n\nIf steps were lost, re-home the machine before doing anything else.\nCSV: " + csvFile;
        log(msg);
        Packages.javax.swing.SwingUtilities.invokeLater(function() {
            MessageBoxes.infoBox("Speed test", msg);
        });
    }

    Packages.org.openpnp.util.UiUtils['submitUiMachineTask(Thrunnable)'](run);
}
