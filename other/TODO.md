# TODO: Refactoring for Standalone Operation

This document outlines the changes needed to make simpler-recorder fully self-contained, removing dependencies on the Looping project infrastructure.

---

## Current Dependencies

### 1. `/looping/capture/create_simpler` (Port 11002)

**What it does now:**
```javascript
// capture-engine.js line 339
outlet(0, "/looping/capture/create_simpler", lastFilePath);
```

This sends OSC to `liveAPI-v6.js` which then:
1. Creates a MIDI track via `liveSet.call("create_midi_track", -1)`
2. Waits 100ms
3. Calls `loadDevice(filepath)` which uses Ableton's browser to load the audio file

**Refactor to:**
Handle MIDI track creation and Simpler loading directly in `capture-engine.js` using LiveAPI.

---

### 2. `/looping/capture/led` (Port 11012)

**What it does now:**
```javascript
// capture-engine.js line 207
outlet(0, "/looping/capture/led", RECORD_PEDAL, state);
```

Sends LED state to Utility Max patch for SoftStep footswitch feedback.

**Refactor to:**
- Remove entirely for standalone version, OR
- Make optional via a config flag, OR
- Keep but document as optional integration point

---

## Refactoring Tasks

### Phase 1: Self-Contained Simpler Creation

- [ ] **Add `createSimplerFromCapture(filepath)` function**

  Replace OSC output with direct LiveAPI calls:

  ```javascript
  function createSimplerFromCapture(filepath) {
      post("[simpler] Creating from: " + filepath + "\n");

      // 1. Create MIDI track at end
      var liveSet = new LiveAPI("live_set");
      liveSet.call("create_midi_track", -1);

      // 2. Wait for track creation, then load
      var loadTask = new Task(function() {
          // Get the newly created track (last one)
          var tracks = liveSet.get("tracks");
          var trackCount = tracks.length / 2;  // LiveAPI returns [id, id, id, ...]
          var newTrackIndex = trackCount - 1;

          // Select the new track
          var viewApi = new LiveAPI("live_set view");
          var newTrack = new LiveAPI("live_set tracks " + newTrackIndex);
          viewApi.set("selected_track", "id", newTrack.id);

          // Load audio file via browser (creates Simpler automatically)
          var browser = new LiveAPI("live_app browser");
          browser.call("load_item", filepath);

          post("[simpler] Loaded on track " + newTrackIndex + "\n");
      });
      loadTask.schedule(150);  // Wait for track creation
  }
  ```

- [ ] **Update `stopRecording()` to call local function**

  ```javascript
  function stopRecording() {
      recorder.message(0);
      isRecording = false;
      post("[record] Stopped:", lastFilePath, "\n");
      sendLedState(LED_OFF);

      // Instead of OSC:
      // outlet(0, "/looping/capture/create_simpler", lastFilePath);

      // Direct creation:
      createSimplerFromCapture(lastFilePath);
  }
  ```

- [ ] **Test the `browser.call("load_item", filepath)` approach**

  Verify this works for audio files and creates a Simpler (not just importing to browser).

  Alternative approaches if `load_item` doesn't work:
  - Use `browser.call("preview_item", filepath)` then load
  - Use `track.call("create_device", "OriginalSimpler")` then set sample path
  - Research AbletonOSC `/live/song/create_midi_track` + `/live/device/load`

---

### Phase 2: LED Feedback (Optional)

- [ ] **Add configuration flag for LED output**

  ```javascript
  var ENABLE_LED_OUTPUT = false;  // Set true for footswitch integration
  var LED_PORT = 11012;

  function sendLedState(state) {
      if (!ENABLE_LED_OUTPUT) return;
      outlet(0, "/looping/capture/led", RECORD_PEDAL, state);
  }
  ```

- [ ] **Or remove LED code entirely**

  If footswitch integration isn't needed for standalone use, simplify by removing:
  - LED state constants
  - `sendLedState()` function
  - All `sendLedState()` calls
  - `RECORD_PEDAL` constant

- [ ] **Document LED integration as optional**

  For users who want footswitch support, document:
  - Required OSC receiver setup
  - Message format: `/looping/capture/led [pedal:int] [state:int]`
  - LED states: 0=off, 1=green, 2=green-flash, 3=red, 4=red-flash

---

### Phase 3: Max Patch Updates

- [ ] **Remove or reconfigure `udpsend` objects**

  Current patch has:
  - `udpsend 127.0.0.1 11002` for Simpler creation
  - `udpsend 127.0.0.1 11012` for LED feedback

  Options:
  - Remove both (if all logic moves to JS)
  - Keep 11012 but make optional
  - Add a `live.menu` to enable/disable external integration

- [ ] **Verify outlet routing**

  If LED output is optional, may need to route JS outlet 0 differently based on message type, or use separate outlets.

- [ ] **Save as new version**

  Save refactored patch as `simpler-recorder-2.0.amxd` to preserve working 1.1 version.

---

### Phase 4: Testing & Documentation

- [ ] **Test in fresh Ableton project**

  Verify device works without any Looping infrastructure:
  - New Live Set (unsaved) → recordings go to /tmp
  - Saved Live Set → recordings go to project folder
  - MIDI track created
  - Simpler contains captured audio
  - Sample plays via MIDI

- [ ] **Test edge cases**
  - Very short recordings (<1 second)
  - Very long recordings (>5 minutes)
  - Rapid toggle on/off
  - Recording while transport stopped
  - Different quantization settings

- [ ] **Update README.md**
  - Remove any references to Looping project
  - Add troubleshooting section
  - Document any limitations

- [ ] **Update CLAUDE.md**
  - Remove "Current Dependencies" section
  - Update code examples

---

## Research Needed

### LiveAPI Browser Loading

Need to verify the exact method for loading audio files into devices:

```javascript
// Option 1: load_item (might just add to browser, not load)
browser.call("load_item", filepath);

// Option 2: Preview then load
browser.call("preview_item", filepath);
// Then user double-clicks or we call load?

// Option 3: Create device first, then set sample
var simpler = track.call("create_device", "OriginalSimpler");
// How to set sample path on Simpler?
```

### Track Selection After Creation

Verify that `create_midi_track(-1)` creates at end AND selects it, or if we need explicit selection.

---

## Nice-to-Have (Future)

- [ ] **UI indicator** - Add `live.dial` or `live.meter~` showing recording level
- [ ] **Sample naming** - Use more descriptive names (include BPM, key?)
- [ ] **Undo support** - Can we make track creation undoable?
- [ ] **Multi-take management** - Keep last N captures accessible
- [ ] **Auto-trim silence** - Detect and trim leading/trailing silence
