# FM Mac Editor

A personal, real-time memory editor for Football Manager 26 on macOS, built for one Mac (yours).
It works like FMCareerLab's workflow: open the game, attach, find a value, preview the change, apply it with verification, and undo if needed.

It does **not** come with a ready-made list of where FM stores players and clubs: nobody has mapped the Mac build.
Instead it has a scanner that finds the values you can see on screen. Save what you find into groups, and they come back after every restart.

## Setup (once)

You need macOS 14+ and Xcode or the Command Line Tools (`xcode-select --install`).

```bash
cd fm-mac-editor
./scripts/build.sh          # builds build/FM Mac Editor.app
./scripts/prepare-game.sh   # quit FM first; re-signs your copy so the editor is allowed in
```

`prepare-game.sh` finds the Steam install automatically. If it can't, pass the path from Steam → right-click FM26 → Manage → Browse local files:
`./scripts/prepare-game.sh "/path/to/Football Manager 26.app"`.
Run it again after every game update or after Steam's "Verify integrity of game files".

## Every time

1. Start Football Manager 26 and load your career.
2. `./scripts/run.sh` (asks for your Mac password: macOS requires admin rights to open another app's memory).
3. **Connect** → Attach next to Football Manager.

## How to find things

**Scanner:** pick a type, type the value you see, then click **First scan**. Change the value in-game (spend money, wait a day, train), type the new value, and click **Next scan**. Repeat until only a few addresses remain. You can also use changed / unchanged / increased / decreased scans.

| What | Try |
|---|---|
| Bank balance, transfer/wage budget | Int32, then Int64 if not found. Use the exact number, not "£12.5M". |
| Attributes (1–20 in game) | Stored 1–100. Use **Between**: 15 → 70 to 79. |
| CA / PA | Int16. |
| Player name | Text UTF-16. Use a unique surname to find the player's record. |

**Memory browser:** right-click a result → *Browse memory here*. A player's other attributes usually sit in the bytes around it. Click a byte to see it as every type, then edit or save it.

**Saved values and groups:** save values into a group such as "Haaland" or "My club". Groups store offsets between their values. After a restart, find any one value of the group again, choose *Save… → Relocate a group*, and every value in the group comes back.

**Freeze:** keeps rewriting a value so the game can't change it.

## How edits are protected

- **Preview:** reads and snapshots the current value. Nothing is written yet.
- **Apply:** re-reads the value first. If the game changed it since the preview, the edit is rejected (compare-and-swap).
- **Read-back:** after writing, the bytes are read back and must match exactly. Otherwise the old bytes are restored.
- **History:** undo is also compare-and-swap. It only restores the old value if the game hasn't changed the new one since.
- **Session protection:** if the game quits or restarts, history, scans and unanchored addresses are discarded.

Back up your save before big edits.

## Development

`FMEditCore` (value encoding, scanner, edit engine, saved table) is platform-neutral and unit-tested. `swift test` runs on macOS or Linux. The SwiftUI app and Mach memory access (`MachMemory`) are macOS-only.

Saved values are stored in `~/Library/Application Support/FMMacEditor/saved-values.json`.

Not affiliated with Sports Interactive, SEGA or FMCareerLab.
