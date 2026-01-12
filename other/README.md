# Simpler Recorder

A Max for Live device that captures audio and automatically loads it into a Simpler instrument on a new MIDI track.

## Features

- **Beat-synced recording** - Start/stop recording quantized to Ableton's global clip trigger quantization setting
- **Automatic Simpler creation** - Captured audio is automatically loaded into a new Simpler on a MIDI track
- **Project-aware file storage** - Recordings saved to your project's `Samples/Recorded/` folder
- **Audio Routes support** - Route any audio source to the capture device

## Requirements

- Ableton Live 12+
- Max for Live
- [Audio Routes](https://www.ableton.com/en/packs/audio-routes/) package (for flexible audio routing)

## Installation

1. Download the latest `.amxd` file from Releases
2. Place it in your User Library: `~/Music/Ableton/User Library/Presets/Audio Effects/Max Audio Effect/`
3. Or drag directly onto a return track in Ableton

## Usage

1. **Add device to a return track** - The device needs audio input, so a return track with Audio Routes works well
2. **Configure audio source** - Use the BrowseRouting UI to select your audio input (e.g., audio interface input)
3. **Arm recording** - Click the toggle or use a footswitch (if configured)
4. **Play** - Recording starts on the next quantization boundary (respects Ableton's global quantization)
5. **Stop** - Toggle off; recording stops on the next quantization boundary
6. **Auto-creates Simpler** - A new MIDI track appears with your captured audio loaded in a Simpler

## How It Works

```
Audio Input → Audio Routes → plugin~ → sfrecord~ → WAV file
                                                      ↓
                                            LiveAPI creates MIDI track
                                                      ↓
                                            Simpler loaded with sample
```

## Configuration

The device respects Ableton's **Global Quantization** setting (the dropdown in the transport bar). Recording start/stop will sync to:
- None (immediate)
- 1/32 to 8 Bars

## File Storage

Recordings are saved as timestamped WAV files:
- **Saved project**: `[Project Folder]/Samples/Recorded/capture_YYYYMMDD_HHMMSS.wav`
- **Unsaved project**: `/tmp/capture_YYYYMMDD_HHMMSS.wav`

## License

MIT License - see [LICENSE](LICENSE)
