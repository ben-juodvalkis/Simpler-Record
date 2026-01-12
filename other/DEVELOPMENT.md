# Audio Capture Device Implementation Plan

**Issue:** #233
**Start Date:** 2025-01-10
**Status:** Phase 7 Complete - Footswitch Integration

---

## Overview

Create a Max for Live device on a return track that captures audio directly from the audio interface (via Audio Routes) and loads it into a Simpler on a new MIDI track.

**Key Design Decisions:**
- V8 JS-centric architecture (minimal Max objects)
- Audio Routes for direct audio interface access
- Toggle-on-beat sync (simplified initial implementation)
- Reuses existing `loadDevice()` infrastructure

---

## Implementation Approach

**Human creates Max patch manually** - The AI assistant provides step-by-step instructions for creating and connecting Max objects, but does not generate .maxpat JSON directly. The human will:
- Create objects in the Max editor
- Connect patch cords between objects
- Set object attributes and arguments
- Position and organize the patch visually

**AI provides:**
- Exact object names and arguments (e.g., `sfrecord~ 2 2 24`)
- Required attributes (e.g., `@varname recorder`)
- Connection instructions (e.g., "connect outlet 0 of X to inlet 0 of Y")
- JavaScript code for `capture-engine.js`
- Verification steps at each checkpoint

---

## Phase 0: Setup & Dependencies

### Tasks
- [x] Download and install Audio Routes package
- [ ] Verify Audio Routes works in test project (sender/receiver pair)
- [x] Create device directory and file
- [x] Create `simpler-recorder-1.0.amxd` device shell

### Checkpoint 0
**Verify before proceeding:**
```
[ ] Audio Routes installed and visible in Live's browser
[ ] Can route audio from interface input to a track using Audio Routes
[ ] Empty .amxd file opens in Max editor
```

---

## Phase 1: Signal Path Only

Build the audio passthrough without any logic.

### Instructions

1. **Create `plugin~ 2`**
   - Object: `plugin~ 2`
   - This creates a stereo audio input that Audio Routes can send to

2. **Create `sfrecord~ 2`**
   - Object: `sfrecord~ 2`
   - Inspector → Scripting Name: `recorder` (required for JS access via `getnamed()`)
   - This will record stereo audio to disk

3. **Create `plugout~ 2`**
   - Object: `plugout~ 2`
   - This passes audio through to the return track output

4. **Add BrowseRouting bpatcher**
   - Object: `bpatcher`
   - Set bpatcher file to: `BrowseRouting.maxpat` (from Audio Routes package)
   - Arguments: `audio_inputs 1` (first stereo pair)

5. **Connect signal path**
   - `plugin~` outlet 0 → `sfrecord~` inlet 0 (left channel)
   - `plugin~` outlet 1 → `sfrecord~` inlet 1 (right channel)
   - `sfrecord~` outlet 0 → `plugout~` inlet 0 (left channel)
   - `sfrecord~` outlet 1 → `plugout~` inlet 1 (right channel)

### Tasks
- [ ] Add `plugin~ 2` (stereo input from Audio Routes)
- [ ] Add `sfrecord~ 2` with Scripting Name `recorder`
- [ ] Add `plugout~ 2` (pass-through to return output)
- [ ] Add `BrowseRouting.maxpat` bpatcher for source selection
- [ ] Wire signal path: `plugin~` → `sfrecord~` → `plugout~`

### Checkpoint 1
**Verify before proceeding:**
```
[ ] Device loads on return track without errors
[ ] BrowseRouting UI appears and shows available sources
[ ] Can select audio interface input in BrowseRouting
[ ] Audio passes through (hear input when return send is up)
[ ] sfrecord~ is in path but not recording (just passing audio)
```

---

## Phase 2: Manual Recording (No JS)

Test sfrecord~ with manual Max UI before adding JS.

### Instructions

1. **Create `live.toggle`**
   - Object: `live.toggle`
   - Attribute: `@varname toggle`

2. **Create message boxes for testing**
   - Message: `open /tmp/test.wav`
   - Message: `1` (start recording)
   - Message: `0` (stop recording)

3. **Create `sel 0 1` to route toggle states**
   - Object: `sel 0 1`
   - Connect `live.toggle` outlet → `sel` inlet

4. **Wire the control flow**
   - `sel` outlet 0 (when toggle goes OFF) → message `0`
   - `sel` outlet 1 (when toggle goes ON) → message `open /tmp/test.wav`
   - Message `open /tmp/test.wav` → `trigger b b` → first bang to message `1`
   - Message `0` → `sfrecord~` inlet 0
   - Message `1` → `sfrecord~` inlet 0 (after open)

   Simplified alternative:
   - `live.toggle` → `sel 0 1`
   - `sel` outlet 1 → `open /tmp/test.wav` message → `sfrecord~` inlet 0
   - Then manually click `1` message to start
   - `sel` outlet 0 → `0` message → `sfrecord~` inlet 0

### Tasks
- [ ] Add `live.toggle` with `@varname toggle`
- [ ] Add message boxes: `open /tmp/test.wav`, `1`, `0`
- [ ] Wire toggle to open file, then manually test start/stop
- [ ] Test manual recording workflow

### Checkpoint 2
**Verify before proceeding:**
```
[ ] Toggle ON → sends "open" then "1" to sfrecord~
[ ] Toggle OFF → sends "0" to sfrecord~
[ ] File created at /tmp/test.wav
[ ] File contains recorded audio (check in Finder/Audacity)
[ ] File is valid WAV that opens in Ableton
```

---

## Phase 3: JavaScript Engine (V8)

Replace manual messages with JS control.

### Instructions

1. **Create the JS file**
   - Create file: `ableton/Looping Capture/capture-engine.js`
   - Use the skeleton code provided below

2. **Add `js` object to patch**
   - Object: `js capture-engine.js @v8 1`
   - The `@v8 1` attribute enables the V8 JavaScript engine

3. **Add `print` for debugging**
   - Object: `print capture-debug`
   - This will show JS output in Max console

4. **Rewire toggle to JS**
   - Disconnect toggle from the manual message boxes
   - Connect `live.toggle` outlet → `js` inlet 0

5. **Wire JS output for debugging**
   - Connect `js` outlet 0 → `print`

6. **Remove or disable manual message boxes**
   - Keep them for reference but disconnect from signal flow

### Tasks
- [ ] Create `capture-engine.js` with V8 flag (see code below)
- [ ] Add `js capture-engine.js @v8 1` object to patch
- [ ] Add `print capture-debug` for Max console output
- [ ] Wire `live.toggle` → `js` inlet 0
- [ ] Wire `js` outlet 0 → `print`
- [ ] Test toggle triggers JS bang function

### Checkpoint 3
**Verify before proceeding:**
```
[ ] JS loads without errors (check Max console)
[ ] Toggle sends bang to JS
[ ] JS can control sfrecord~ via getnamed()
[ ] Recording starts/stops via JS
[ ] Max console shows state transitions
[ ] File created at hardcoded path
```

**capture-engine.js skeleton:**
```javascript
"use strict";

autowatch = 1;
inlets = 2;   // 0: toggle, 1: beat
outlets = 1;  // 0: OSC out

var recorder = null;
var isArmed = false;
var isRecording = false;
var captureCount = 0;
var lastFilePath = "";

function bang() {
    // From toggle (inlet 0)
    if (inlet === 0) {
        isArmed = !isArmed;
        post("Armed:", isArmed, "\n");

        // For Phase 3: immediate start/stop (no beat sync yet)
        if (isArmed && !isRecording) {
            startRecording();
        } else if (!isArmed && isRecording) {
            stopRecording();
        }
    }
}

function startRecording() {
    var filepath = "/tmp/capture_" + (++captureCount) + ".wav";
    lastFilePath = filepath;

    recorder = this.patcher.getnamed("recorder");
    recorder.message("open", filepath);
    recorder.message(1);
    isRecording = true;
    post("Recording started:", filepath, "\n");
}

function stopRecording() {
    recorder.message(0);
    isRecording = false;
    post("Recording stopped:", lastFilePath, "\n");

    // Phase 5: Will send OSC here
    outlet(0, "/looping/capture/create_simpler", lastFilePath);
}
```

---

## Phase 4: Project Path Detection

Get the actual project folder instead of /tmp.

### Instructions

1. **Research approach**
   - The `pg.liveset.path` device parses Ableton's Log.txt to find the current project
   - Log.txt location: `~/Library/Preferences/Ableton/Live 12.1/Log.txt`
   - Look for lines containing `file:///` and `.als`

2. **Update capture-engine.js**
   - AI will provide updated `getProjectPath()` function
   - Uses Max's file reading capabilities or shell command

3. **Create Samples/Recorded directory**
   - JS should create the directory if it doesn't exist
   - Use: `max.createfolder(path)` or similar

4. **No new Max objects needed**
   - This is purely a JS code update

### Tasks
- [ ] Research `pg.liveset.path` implementation (AI will help)
- [ ] Update `getProjectPath()` in JS (AI provides code)
- [ ] Handle directory creation for Samples/Recorded/
- [ ] Handle edge case: unsaved project (fallback to /tmp)
- [ ] Test with actual Live project

### Checkpoint 4
**Verify before proceeding:**
```
[ ] getProjectPath() returns correct project folder
[ ] Works with saved project
[ ] Graceful handling of unsaved project
[ ] Files created in project's Samples/Recorded/ folder
[ ] Files appear in Live's browser under project
```

---

## Phase 5: OSC Communication

Send capture completion to main Max patch.

### Instructions

1. **Add `udpsend` for OSC output**
   - Object: `udpsend 127.0.0.1 11002`
   - Port 11002 is the maxObserver port (receives from bridge and other devices)

2. **Wire JS to udpsend**
   - Connect `js` outlet 0 → `udpsend` inlet
   - Keep the `print` connection for debugging (use a `t l l` to split)

3. **Update liveAPI-v6.js** (AI will provide exact code)
   - Add routing in `anything()` function
   - Add `handleCaptureCreateSimpler(filepath)` function

### Tasks
- [ ] Add `udpsend 127.0.0.1 11002` object
- [ ] Wire `js` outlet 0 → `udpsend` (and keep print for debug)
- [ ] Add handler in `liveAPI-v6.js` for `/looping/capture/create_simpler`
- [ ] Test OSC message reaches main Max patch (check Max console)
- [ ] Test end-to-end: capture → OSC → Simpler creation

### Checkpoint 5
**Verify before proceeding:**
```
[ ] OSC message sent when recording stops
[ ] Main Max patch receives /looping/capture/create_simpler
[ ] MIDI track created
[ ] Simpler loaded with captured audio
[ ] Sample plays correctly via MIDI
```

**liveAPI-v6.js handler:**
```javascript
// Add to anything() routing section:
else if (address === "/looping/capture/create_simpler") {
    handleCaptureCreateSimpler(args[0]);
}

function handleCaptureCreateSimpler(filepath) {
    log("Creating Simpler from capture: " + filepath);

    // Create MIDI track at end
    var liveSet = new LiveAPI("live_set");
    liveSet.call("create_midi_track", -1);

    // Wait for track creation, then load
    var task = new Task(function() {
        loadDevice(filepath);
    }, this);
    task.schedule(100);
}
```

---

## Phase 6: Beat Sync

Quantize recording start/stop to beats.

### Instructions

1. **Add `live.observer` for transport**
   - Object: `live.observer`
   - Attribute: `@property current_song_time` (or `@property is_playing`)
   - Note: We may need to experiment with which property gives us beat boundaries

2. **Alternative: Use `live.object` with transport**
   - Object: `live.path live_set`
   - Object: `live.observer @property current_song_time`
   - This observes the song position in beats

3. **Create beat detection logic**
   - May need `change` object to detect when beat number changes
   - Or use `%` (modulo) to detect beat boundaries

4. **Wire to JS inlet 1**
   - Connect beat detection output → `js` inlet 1
   - JS will receive beat notifications on inlet 1

### Tasks
- [ ] Add `live.observer` watching transport position
- [ ] Add logic to detect beat boundaries (change, floor, etc.)
- [ ] Wire beat detection → `js` inlet 1
- [ ] Update `capture-engine.js` with `beat()` function (code provided)
- [ ] Modify state machine: toggle sets armed, beat triggers start/stop
- [ ] Test beat-synced recording

### Checkpoint 6
**Verify before proceeding:**
```
[ ] live.observer fires on each beat
[ ] JS receives beat notifications on inlet 1
[ ] Recording starts on beat after toggle ON
[ ] Recording stops on beat after toggle OFF
[ ] Recordings are beat-aligned (check waveform)
```

**Updated JS for beat sync:**
```javascript
function beat(position) {
    // From live.observer (inlet 1)
    if (inlet === 1) {
        if (isArmed && !isRecording) {
            startRecording();
        } else if (!isArmed && isRecording) {
            stopRecording();
        }
    }
}

function bang() {
    // Toggle just sets armed state, doesn't start/stop directly
    if (inlet === 0) {
        isArmed = !isArmed;
        post("Armed:", isArmed, "(will sync on next beat)\n");
    }
}
```

---

## Phase 7: Footswitch Integration

Add OSC input for hardware footswitch.

### Instructions

1. **Add `udpreceive` for footswitch OSC**
   - Object: `udpreceive 9999`
   - Port 9999 is an example; use whatever port your footswitch sends to

2. **Add OSC routing**
   - Object: `route /capture`
   - This filters for the `/capture` address

3. **Convert to bang for JS**
   - Object: `t b` (trigger bang)
   - This ensures JS receives a bang regardless of OSC args

4. **Wire to JS inlet 0**
   - `udpreceive` → `route /capture` → `t b` → `js` inlet 0
   - This shares inlet 0 with the `live.toggle`

5. **Merge toggle and footswitch**
   - Both `live.toggle` and footswitch route should connect to `js` inlet 0
   - Use a simple connection (Max allows multiple connections to same inlet)

### Tasks
- [x] Add OSC receive for footswitch (via pedalboard abstraction)
- [x] Route `/pedalboard/5/on` to `bang()` function
- [x] Add LED feedback for recording state
- [x] Wire LED messages to port 11012
- [x] Test footswitch triggers same as UI toggle

### Checkpoint 7
**Verify before proceeding:**
```
[x] Footswitch toggles recording same as UI
[x] LED shows armed state (red flashing)
[x] LED shows recording state (green)
[x] LED turns off when stopped
```

---

## Phase 8: Polish & Integration

Final cleanup and session template integration.

### Instructions

1. **Add recording indicator**
   - Object: `live.button` or `live.dial`
   - Attribute: `@varname led`
   - JS can set this via `this.patcher.getnamed("led").message(1)` when recording

2. **Update sfrecord~ for quality**
   - Change to: `sfrecord~ 2 2 24` for 24-bit recording
   - Or: `sfrecord~ 2 2 32` for 32-bit float

3. **Add to session template**
   - Save device to: `ableton/Looping Capture/audio-capture.amxd`
   - Add to Return A in your default session template
   - Configure Audio Routes to receive from desired input

### Tasks
- [ ] Add visual feedback on device (LED indicator for recording state)
- [ ] Set proper audio format: `sfrecord~ 2 2 24` (24-bit)
- [ ] Add to default session template on Return A
- [ ] Update CLAUDE.md if needed
- [ ] Create ADR documenting the implementation
- [ ] Close issue #233

### Checkpoint 8 (Final)
**Verify complete workflow:**
```
[ ] Device on return track in session template
[ ] Audio Routes selects interface input
[ ] Footswitch or UI toggle arms recording
[ ] Recording starts on next beat
[ ] Toggle again stops on next beat
[ ] Simpler created with captured audio
[ ] Sample plays chromatically via MIDI
[ ] No errors in Max console
[ ] No errors in browser console
```

---

## File Locations

```
ableton/
├── M4L devices/
│   └── simpler-recorder/
│       ├── simpler-recorder-1.0.amxd    # Main device
│       └── capture-engine.js            # V8 JavaScript engine
└── scripts/
    └── liveAPI-v6.js                    # Add handler (existing file)

documentation/
├── current-project/
│   └── audio-capture-implementation.md  # This file
└── adr/
    └── 0XX-audio-capture-device.md      # Final ADR (Phase 8)
```

---

## Quick Reference

### OSC Addresses
| Address | Port | Direction | Purpose |
|---------|------|-----------|---------|
| `/capture` | 9999 | Footswitch → Device | Toggle armed state |
| `/looping/capture/create_simpler` | 11002 | Device → Main Max | Create Simpler |

### JS Inlets/Outlets
| Inlet | Source | Purpose |
|-------|--------|---------|
| 0 | toggle / footswitch | Toggle armed state |
| 1 | live.observer | Beat sync |

| Outlet | Destination | Purpose |
|--------|-------------|---------|
| 0 | udpsend 11002 | OSC to main Max |

---

## Notes & Decisions Log

_Record important decisions and discoveries here during implementation._

### 2025-01-10
- Created implementation plan
- Chose V8 JS-centric approach over pure Max
- Deferred trimming and multiple buffers for later iteration

---

## Implementation Log

### Phase 0: Setup & Dependencies
**Completed:** 2025-01-10

- [x] Downloaded and installed Audio Routes package
- [x] Created device at `ableton/M4L devices/simpler-recorder/simpler-recorder-1.0.amxd`

**Notes:**
- Device lives in `M4L devices/simpler-recorder/` directory

### Phase 1: Signal Path
**Completed:** 2025-01-10

- [x] Added `plugin~ 2`, `sfrecord~ 2`, `plugout~ 2`
- [x] Set Scripting Name `recorder` on sfrecord~
- [x] Wired signal path
- [x] Added BrowseRouting bpatcher

### Phase 2: Manual Recording
**Skipped:** Already confident sfrecord~ works

**Notes:**
- Proceeding directly to Phase 3: JavaScript Engine

### Phase 3: JavaScript Engine
**Complete:** 2025-01-10

- [x] Created `capture-engine.js` with V8 engine
- [x] Fixed `this.patcher` → `patcher` for V8 compatibility
- [x] Fixed `bang()` → `msg_int()` for live.toggle compatibility
- [x] Auto-initialization on script load
- [x] Added explicit `loadbang()` call at script end (like liveAPI-v6.js)

**Notes:**
- V8 requires `patcher` global instead of `this.patcher`
- `live.toggle` sends int (0/1), not bang - requires `msg_int(value)` function

### Phase 4: Project Path Detection
**Complete:** 2025-01-10

- [x] Researched `pg.liveset.path` approach (Log.txt parsing) - unreliable
- [x] Switched to LiveAPI `live_set.file_path` property
- [x] Discovered V8 object + LiveAPI timing issue (id=0 at parse time)
- [x] Implemented `Task.schedule(100)` deferred initialization
- [x] ✓ Project path detection working automatically on device load

**Key Learnings - V8 Object + LiveAPI:**

1. **V8 object cannot use LiveAPI at script parse time** - `api.id` returns `0`, all calls fail
2. **Solution: Use `Task.schedule(100)`** to defer LiveAPI calls by 100ms
3. **Song object uses `file_path` property**, not `path` (which doesn't exist)

**Working initialization pattern for V8:**
```javascript
var initTask = new Task(deferredInit);

function deferredInit() {
    var liveSetApi = new LiveAPI("live_set");
    var pathResult = liveSetApi.get("file_path");
    // ... use pathResult
}

function loadbang() {
    initTask.schedule(100);  // 100ms delay lets LiveAPI become ready
}

loadbang();  // Explicit call at end of script
```

**Test file created:** `test-liveapi.js` - minimal LiveAPI test for debugging

### Phase 5: OSC Communication
**Complete:** 2025-01-10

- [x] Added `udpsend 127.0.0.1 11002` to Max patch
- [x] Added routing in `liveAPI-v6.js` for `/looping/capture/create_simpler`
- [x] Added `handleCaptureCreateSimpler(filepath)` function
- [x] ✓ End-to-end working: capture → OSC → MIDI track → Simpler loaded

### Phase 6: Beat Sync
**Complete:** 2025-01-10

- [x] Added `live.path live_set` + `live.observer @property current_song_time`
- [x] Single inlet design with `prepend record` and `prepend time` routing
- [x] JS-based beat detection using `Math.floor()` + change detection
- [x] Fallback to immediate start/stop when transport stopped
- [x] Timestamp-based filenames (`capture_YYYYMMDD_HHMMSS.wav`) to prevent overwrites
- [x] ✓ Beat-synced recording working
- [x] **Enhanced:** Uses global `clip_trigger_quantization` instead of hardcoded 1-beat
- [x] LiveAPI observer for `clip_trigger_quantization` (auto-updates when changed)
- [x] Query `file_path` on arm (not observable, so queried on demand)

**Key Design Decisions:**
- Single inlet with message routing (`record()`, `time()`) instead of multiple inlets
- Transport detection via `Date.now() - lastTimeUpdate < 500ms`
- Timestamp filenames guarantee uniqueness across sessions
- Global quantization: Recording syncs to Ableton's transport bar quantization setting (None, 1 Bar, 4 Bars, etc.)
- `file_path` is not observable in LiveAPI, so we query it on init and on each arm

### Phase 7: Footswitch Integration
**Complete:** 2026-01-10

- [x] Added CC 54 → `/pedalboard/5/on|off` in Utility Max patch
- [x] Wired `/pedalboard/5/on` to `bang()` function in capture-engine.js
- [x] Added LED feedback via `/looping/capture/led` messages
- [x] LED states: Off (stopped), Green (recording), Red flashing (armed)
- [x] ✓ Footswitch toggles recording with LED feedback

**Implementation Notes:**
- Uses pedal 5 for button input, pedal 6 for LED output
- LED messages sent directly to Utility Max on port 11012
- Simplified LED architecture per ADR 154 (individual source LED updates)
