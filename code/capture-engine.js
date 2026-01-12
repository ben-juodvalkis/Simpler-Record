autowatch = 1;
inlets = 1;   // All messages via prepend (record, time)
outlets = 1;  // 0: OSC out (create_simpler, LED updates)

// LED state constants
var LED_OFF = 0;
var LED_GREEN = 1;
var LED_GREEN_FLASH = 2;
var LED_RED = 3;
var LED_RED_FLASH = 4;
var RECORD_PEDAL = 6;  // Pedal 6 for recording

// State
var recorder = null;
var isArmed = false;
var isRecording = false;
var captureCount = 0;
var lastFilePath = "";

// Beat sync state
var lastQuantBoundary = -1;  // For detecting quantization boundaries
var lastTimeUpdate = 0;      // Timestamp of last time() call (for fallback detection)

// Quantization state (from global clip_trigger_quantization)
var quantizationValue = 7;   // Default to 1/4 note (index 7)
var quantizationBeats = 1;   // Default to 1 beat
var quantObserver = null;    // LiveAPI observer for clip_trigger_quantization

// Quantization enum to beats conversion
// 0=None, 1=8bars, 2=4bars, 3=2bars, 4=1bar, 5=1/2, 6=1/2T, 7=1/4, 8=1/4T, 9=1/8, 10=1/8T, 11=1/16, 12=1/16T, 13=1/32
var QUANT_TO_BEATS = [
    0,      // 0: None (immediate)
    32,     // 1: 8 Bars
    16,     // 2: 4 Bars
    8,      // 3: 2 Bars
    4,      // 4: 1 Bar
    2,      // 5: 1/2
    4/3,    // 6: 1/2T (triplet)
    1,      // 7: 1/4
    2/3,    // 8: 1/4T (triplet)
    0.5,    // 9: 1/8
    1/3,    // 10: 1/8T (triplet)
    0.25,   // 11: 1/16
    1/6,    // 12: 1/16T (triplet)
    0.125   // 13: 1/32
];

var QUANT_NAMES = [
    "None", "8 Bars", "4 Bars", "2 Bars", "1 Bar",
    "1/2", "1/2T", "1/4", "1/4T", "1/8", "1/8T", "1/16", "1/16T", "1/32"
];

// Project path (detected on init and on each record)
var projectPath = "/tmp";  // Default fallback

// Live API reference (created at parse time, like liveAPI-v6.js)
var api = new LiveAPI();

// Task for deferred initialization (LiveAPI needs time to be ready in v8 object)
var initTask = new Task(deferredInit);

// =============================================================================
// INITIALIZATION
// =============================================================================

// Deferred initialization - called by Task after delay
function deferredInit() {
    post("[init] Deferred init running...\n");
    refreshProjectPath();  // Get initial path
    setupQuantizationObserver();
}

// =============================================================================
// PROJECT PATH (queried on demand - file_path is not observable)
// =============================================================================

// Query and update project path from live_set file_path
function refreshProjectPath() {
    post("[path] Querying file_path...\n");
    try {
        var liveSetApi = new LiveAPI("live_set");
        if (!liveSetApi || liveSetApi.id === "0") {
            post("[path] ✗ LiveAPI not ready, using /tmp\n");
            projectPath = "/tmp";
            return;
        }

        var pathResult = liveSetApi.get("file_path");
        post("[path] file_path raw: " + JSON.stringify(pathResult) + "\n");

        if (pathResult && pathResult.length > 0 && pathResult[0] !== "") {
            var alsPath = String(pathResult[0]);
            var lastSlash = alsPath.lastIndexOf("/");
            if (lastSlash > 0) {
                projectPath = alsPath.substring(0, lastSlash);
            } else {
                projectPath = alsPath;
            }
            post("[path] ✓ Project path: " + projectPath + "\n");
        } else {
            projectPath = "/tmp";
            post("[path] ✗ No path (unsaved project?), using /tmp\n");
        }
    } catch (e) {
        post("[path] Error: " + e.message + "\n");
        projectPath = "/tmp";
    }
}

// =============================================================================
// QUANTIZATION OBSERVER
// =============================================================================

// Callback for quantization observer
function quantizationChanged(args) {
    post("[quant] Observer callback received: " + args.join(", ") + "\n");
    if (args[0] === "clip_trigger_quantization") {
        var newValue = parseInt(args[1]);
        if (newValue >= 0 && newValue < QUANT_TO_BEATS.length) {
            quantizationValue = newValue;
            quantizationBeats = QUANT_TO_BEATS[newValue];
            post("[quant] ✓ Changed to: " + QUANT_NAMES[newValue] + " (" + quantizationBeats + " beats)\n");
        }
    }
}

// Set up observer for global clip_trigger_quantization
function setupQuantizationObserver() {
    post("[quant] Setting up clip_trigger_quantization observer...\n");
    try {
        // Clean up previous observer if exists
        if (quantObserver) {
            post("[quant] Cleaning up previous observer\n");
            quantObserver.property = "";
            quantObserver.id = 0;
            quantObserver = null;
        }

        // Create observer for clip_trigger_quantization
        quantObserver = new LiveAPI(quantizationChanged, "live_set");
        post("[quant] Created LiveAPI observer, id: " + quantObserver.id + "\n");
        quantObserver.property = "clip_trigger_quantization";
        post("[quant] Set property to 'clip_trigger_quantization'\n");

        // Get initial value
        var initialValue = quantObserver.get("clip_trigger_quantization");
        post("[quant] Initial value raw: " + JSON.stringify(initialValue) + "\n");
        if (initialValue && initialValue.length > 0) {
            quantizationValue = parseInt(initialValue[0]);
            quantizationBeats = QUANT_TO_BEATS[quantizationValue] || 1;
            post("[quant] ✓ Initial: " + QUANT_NAMES[quantizationValue] + " (" + quantizationBeats + " beats)\n");
        }
    } catch (e) {
        post("[quant] Error setting up observer: " + e.message + "\n");
    }
}

// In V8, use the global 'patcher' object instead of 'this.patcher'
// Initialize immediately since patcher should be available at parse time
function doInit() {
    post("\n");
    post("=== capture-engine.js v8 initializing ===\n");

    // Cache recorder reference using global 'patcher'
    recorder = patcher.getnamed("recorder");
    if (recorder) {
        post("[init] ✓ Found sfrecord~ with scripting name 'recorder'\n");
    } else {
        post("[init] ✗ ERROR: Could not find sfrecord~ with scripting name 'recorder'\n");
    }

    // Note: Project path detection deferred to loadbang (Live API not ready at script load)
    post("[init] Initialization complete (path detection on loadbang)\n");
    post("===========================================\n");
}

// Run init when script loads
doInit();

// loadbang fires when device is fully loaded in Live
// But in v8 object, LiveAPI may not be ready yet - use Task to defer
function loadbang() {
    post("\n");
    post("=== loadbang: scheduling deferred init ===\n");

    // Re-init recorder if needed
    if (!recorder) {
        recorder = patcher.getnamed("recorder");
    }

    // Schedule deferred init after 100ms to let LiveAPI become ready
    initTask.schedule(100);
}

// Handle explicit "init" message
function init() {
    doInit();
}

// =============================================================================
// LED STATE
// =============================================================================

function sendLedState(state) {
    // Send LED update to Utility Max via port 11012
    // Message format: /looping/capture/led [pedal] [state]
    outlet(0, "/looping/capture/led", RECORD_PEDAL, state);
    post("[led] Pedal " + RECORD_PEDAL + " → state " + state + "\n");
}

// =============================================================================
// RECORDING CONTROL
// =============================================================================

function record(value) {
    // From toggle via "prepend record" - receives 0 or 1
    isArmed = (value === 1);

    // Refresh project path on arm (file_path is not observable)
    if (isArmed) {
        refreshProjectPath();
    }

    // Check if transport is playing (received time update recently)
    var transportPlaying = (Date.now() - lastTimeUpdate) < 500;

    if (transportPlaying) {
        var quantName = QUANT_NAMES[quantizationValue] || "1/4";
        post("Armed:", isArmed, "(will sync to " + quantName + ")\n");

        // Send LED state - armed = red flashing (waiting for beat)
        if (isArmed && !isRecording) {
            sendLedState(LED_RED_FLASH);
        } else if (!isArmed && !isRecording) {
            sendLedState(LED_OFF);
        }
    } else {
        // Fallback: immediate start/stop when transport stopped
        post("Armed:", isArmed, "(immediate - transport stopped)\n");
        if (isArmed && !isRecording) {
            startRecording();
        } else if (!isArmed && isRecording) {
            stopRecording();
        }
    }
}

function bang() {
    // For footswitch (Phase 7) - toggle on bang
    record(isArmed ? 0 : 1);
}

// =============================================================================
// BEAT SYNC (Phase 6)
// =============================================================================

function time(value) {
    // Receives current_song_time from live.observer via prepend
    lastTimeUpdate = Date.now();

    // Handle "None" quantization (immediate)
    if (quantizationBeats === 0) {
        // With "None", we trigger on any time update if armed state changed
        if (isArmed && !isRecording) {
            startRecording();
        } else if (!isArmed && isRecording) {
            stopRecording();
        }
        return;
    }

    // Calculate current quantization boundary
    var currentQuantBoundary = Math.floor(value / quantizationBeats);
    if (currentQuantBoundary !== lastQuantBoundary) {
        lastQuantBoundary = currentQuantBoundary;
        onQuantBoundary();
    }
}

function onQuantBoundary() {
    // Trigger start/stop on quantization boundary when armed state differs from recording state
    if (isArmed && !isRecording) {
        startRecording();
    } else if (!isArmed && isRecording) {
        stopRecording();
    }
}

function startRecording() {
    // Ensure recorder is cached
    if (!recorder) {
        recorder = patcher.getnamed("recorder");
        if (!recorder) {
            post("[record] ERROR: recorder not found!\n");
            return;
        }
    }

    // Build filename with timestamp (YYYYMMDD_HHMMSS)
    var now = new Date();
    var timestamp = now.getFullYear().toString() +
        ("0" + (now.getMonth() + 1)).slice(-2) +
        ("0" + now.getDate()).slice(-2) + "_" +
        ("0" + now.getHours()).slice(-2) +
        ("0" + now.getMinutes()).slice(-2) +
        ("0" + now.getSeconds()).slice(-2);
    var filename = "capture_" + timestamp + ".wav";

    if (projectPath && projectPath !== "/tmp") {
        lastFilePath = projectPath + "/Samples/Recorded/" + filename;
    } else {
        lastFilePath = "/tmp/" + filename;
    }

    recorder.message("open", lastFilePath);
    recorder.message(1);
    isRecording = true;
    post("[record] Started:", lastFilePath, "\n");

    // LED: green when recording
    sendLedState(LED_GREEN);
}

function stopRecording() {
    if (!recorder) {
        post("[record] ERROR: recorder not found!\n");
        return;
    }

    recorder.message(0);
    isRecording = false;
    post("[record] Stopped:", lastFilePath, "\n");

    // LED: off when stopped
    sendLedState(LED_OFF);

    // Send OSC to create Simpler with captured audio
    post("[osc] Sending /looping/capture/create_simpler", lastFilePath, "\n");
    outlet(0, "/looping/capture/create_simpler", lastFilePath);
}

// =============================================================================
// SCRIPT INITIALIZATION
// =============================================================================

// Explicitly call loadbang at script load (like liveAPI-v6.js line 5055)
// This ensures initialization happens even if Max's automatic loadbang doesn't fire in V8
loadbang();
