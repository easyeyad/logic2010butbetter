#if os(macOS)
FMMacEditorApp.main()
#else
// The editor UI and Mach memory access are macOS-only; this keeps `swift build` / `swift test` working elsewhere.
print("FMMacEditor only runs on macOS.")
#endif
