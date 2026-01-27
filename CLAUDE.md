# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Simpler Recorder is a Max for Live device that captures audio and loads it into a Simpler instrument.

**Tech Stack**: Max for Live + JavaScript (V8 engine)

## Project Structure

```
simpler-recorder/
├── README.md                    # User documentation
├── LICENSE                      # MIT License
├── CLAUDE.md                    # This file
├── TODO.md                      # Refactoring tasks
├── DEVELOPMENT.md               # Implementation notes and history
├── capture-engine.js            # V8 JavaScript engine (main logic)
├── simpler-recorder-1.0.amxd    # Original device version
└── simpler-recorder-1.1.amxd    # Current device version
```

## Key Files

### capture-engine.js

The V8 JavaScript engine that handles:
- Recording state machine (armed → recording → stopped)
- Beat synchronization via `clip_trigger_quantization` observer
- Project path detection via `live_set.file_path`
- File naming with timestamps
- OSC output for Simpler creation (currently depends on external system)

### .amxd Files

Max for Live device patches containing:
- `plugin~` / `plugout~` for audio passthrough
- `sfrecord~` for WAV recording (scripting name: `recorder`)
- `BrowseRouting.maxpat` bpatcher for Audio Routes integration
- `live.toggle` for UI control
- `live.observer` for transport time
- `js capture-engine.js @v8 1` for JavaScript logic
- `udpsend` for OSC output

## V8 JavaScript Notes

### LiveAPI Timing Issue

LiveAPI is not available at script parse time in V8 objects. Always use deferred initialization:

```javascript
var initTask = new Task(deferredInit);

function deferredInit() {
    var api = new LiveAPI("live_set");
    // Now api.id will be valid
}

function loadbang() {
    initTask.schedule(100);  // 100ms delay
}

loadbang();  // Explicit call at end of script
```

### Global `patcher` in V8

Use `patcher` instead of `this.patcher`:

```javascript
// V8:
recorder = patcher.getnamed("recorder");

// Old JS (pre-V8):
recorder = this.patcher.getnamed("recorder");
```

### Message Handling

`live.toggle` sends integers (0/1), not bangs. Handle with named functions:

```javascript
function record(value) {
    isArmed = (value === 1);
    // ...
}
```

## OSC Integration

The device communicates via OSC for UI control and feedback.

### Incoming Commands (Port 11008)

| Message | Purpose |
|---------|---------|
| `/capture/arm` | Arm recording (quantized start on next beat boundary) |
| `/capture/disarm` | Disarm/stop recording (quantized stop on next beat boundary) |
| `/capture/start` | Start recording immediately (bypass quantization) |
| `/capture/stop` | Stop recording immediately (bypass quantization) |
| `/capture/query` | Request current state (for UI sync on connect) |

### Outgoing State (Port 11009)

| Message | Purpose |
|---------|---------|
| `/capture/state [state]` | State machine: `idle`, `pending`, `recording`, `stopping` |
| `/capture/quantization [name]` | Current quantization setting (e.g., "1/4", "1 Bar") |
| `/capture/file [path]` | Path to last recorded file |

### Other Outgoing (Port 11002, 11012)

| Message | Port | Purpose |
|---------|------|---------|
| `/looping/capture/create_simpler [path]` | 11002 | Create MIDI track + load Simpler |
| `/looping/capture/led [pedal] [state]` | 11012 | Footswitch LED feedback |

### Max Patch Wiring

```
[udpreceive 11008]
        |
[osc-route /capture]
        |
[route /arm /disarm /start /stop /query]
  |     |      |      |      |
[arm] [disarm] [start] [stop] [query]  <- message boxes
  \     \       |       /      /
   \___________\|/_____/______/
               |
         [v8 capture-engine.js]
          |              |
     outlet 0       outlet 1
          |              |
    (create_simpler, [udpsend 127.0.0.1 11009]
     LED updates)
```

## V8 Object Quirks

### Function Name Conflicts

The `time` function conflicts with something in v8. Use early stub + alias pattern:

```javascript
// Early stub near top of file
function time(value) { /* ignore */ }

// Actual handler with different name
function songtime(value) {
    if (typeof value !== 'number' || isNaN(value)) return;
    // ... handle time updates
}

// Alias at end of file
function time(value) { songtime(value); }
```

### live.observer "none" Values

When `live.observer` can't read a property, it outputs `none` as a symbol:

```javascript
function songtime(value) {
    // Guard against invalid values
    if (typeof value !== 'number' || isNaN(value)) {
        return;
    }
    // ...
}
```

## Testing

To test the device:
1. Open Ableton Live with a saved project
2. Add device to a return track
3. Configure Audio Routes to receive audio input
4. Toggle recording on/off
5. Verify:
   - Recording syncs to quantization setting
   - WAV file created in project's Samples/Recorded/
   - MIDI track created with Simpler containing the sample

## Important Rules

- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files
- Test changes in Ableton Live before committing
- Keep the device self-contained (no external dependencies)
