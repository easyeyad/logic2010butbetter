#if os(macOS)
import AppKit
import FMEditCore
import SwiftUI

struct FMMacEditorApp: App {
    @StateObject private var model = AppModel()

    init() {
        // Lets the window come to the front when launched from Terminal / sudo.
        NSApplication.shared.setActivationPolicy(.regular)
    }

    var body: some Scene {
        WindowGroup("FM Mac Editor") {
            ContentView()
                .environmentObject(model)
                .frame(minWidth: 1000, minHeight: 660)
                .onAppear { NSApp.activate(ignoringOtherApps: true) }
        }
    }
}

enum Pane: String, CaseIterable, Identifiable {
    case connect = "Connect", scanner = "Scanner", saved = "Saved values", memory = "Memory browser", history = "History"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .connect: return "bolt.horizontal.circle"
        case .scanner: return "magnifyingglass"
        case .saved: return "star"
        case .memory: return "square.grid.3x3"
        case .history: return "clock.arrow.circlepath"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        NavigationSplitView {
            List(Pane.allCases, selection: Binding(get: { model.pane }, set: { if let p = $0 { model.pane = p } })) { p in
                Label(p.rawValue, systemImage: p.icon).tag(p)
            }
            .navigationSplitViewColumnWidth(200)
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 6) {
                    Circle().fill(model.memory == nil ? Color.secondary : Color.green).frame(width: 8, height: 8)
                    Text(model.memory == nil ? "Not connected" : model.attachedName).font(.caption).lineLimit(1)
                    Spacer()
                }
                .padding(10)
            }
        } detail: {
            VStack(spacing: 0) {
                if let error = model.lastError {
                    HStack(alignment: .top) {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                        Text(error).textSelection(.enabled)
                        Spacer()
                        Button("Dismiss") { model.lastError = nil }
                    }
                    .padding(10)
                    .background(Color.orange.opacity(0.12))
                }
                Group {
                    switch model.pane {
                    case .connect: ConnectView()
                    case .scanner: ScannerView()
                    case .saved: SavedView()
                    case .memory: MemoryView()
                    case .history: HistoryView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .sheet(item: $model.editTarget) { EditSheet(target: $0).environmentObject(model) }
    }
}

struct PaneHeader: View {
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.title2.bold())
            Text(subtitle).foregroundStyle(.secondary)
        }
    }
}

struct NotConnected: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "bolt.horizontal.circle").font(.largeTitle).foregroundStyle(.secondary)
            Text("Attach to Football Manager first.")
            Button("Go to Connect") { model.pane = .connect }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Connect

struct ConnectView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            PaneHeader(title: "Connect", subtitle: "Open Football Manager 26, load your career, then attach.")
            HStack {
                Text(model.status)
                Spacer()
                Button("Refresh") { model.refreshProcesses() }
                if model.memory != nil { Button("Disconnect") { model.detach(reason: nil) } }
            }
            List(model.processes) { p in
                HStack(spacing: 10) {
                    Image(nsImage: NSWorkspace.shared.icon(forFile: p.path)).resizable().frame(width: 28, height: 28)
                    VStack(alignment: .leading) {
                        Text(p.name).fontWeight(p.looksLikeFM ? .semibold : .regular)
                        Text("pid \(p.pid)").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if model.memory?.pid == p.pid {
                        Label("Attached", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    } else {
                        Button("Attach") { model.attach(p) }
                    }
                }
                .padding(.vertical, 2)
            }
            .frame(minHeight: 220)
            GroupBox("If attaching fails") {
                Text("""
                macOS only lets the editor into the game if the game was prepared and the editor runs with admin rights. \
                In Terminal, from the fm-mac-editor folder: run ./scripts/prepare-game.sh once (and again after every game update), \
                then always start the editor with ./scripts/run.sh.
                """)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
            }
        }
        .padding(20)
    }
}

// MARK: - Scanner

struct ScanRow: Identifiable {
    let id: Int
    let address: UInt64
    let scanned: String
    let current: String
}

struct ScannerView: View {
    @EnvironmentObject var model: AppModel
    @State private var selection = Set<Int>()
    @State private var saveRequest: SaveRequest?
    private let maxRows = 500

    var body: some View {
        if model.memory == nil { NotConnected() } else { content }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            PaneHeader(
                title: "Scanner",
                subtitle: "Find a value you can see in the game, change it in-game, scan again. Repeat until a few addresses remain."
            )
            controls
            if model.isScanning {
                HStack {
                    ProgressView(value: model.progress).frame(maxWidth: 400)
                    Button("Stop") { model.stopScan() }
                }
            }
            resultsTable
            tips
        }
        .padding(20)
        .sheet(item: $saveRequest) { SaveSheet(request: $0).environmentObject(model) }
    }

    private var isFirst: Bool { model.results == nil }
    private var fieldCount: Int {
        isFirst ? (model.firstKind == .between ? 2 : 1) : model.nextKind.valueFields
    }

    private var controls: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Picker("Type", selection: $model.scanType) {
                ForEach(ValueType.allCases) { Text($0.displayName).tag($0) }
            }
            .frame(width: 220)
            .disabled(!isFirst)

            if isFirst {
                Picker("Scan", selection: $model.firstKind) {
                    ForEach(FirstScanKind.allCases) { Text($0.rawValue).tag($0) }
                }
                .frame(width: 200)
            } else {
                Picker("Scan", selection: $model.nextKind) {
                    ForEach(NextScanKind.allCases) { Text($0.rawValue).tag($0) }
                }
                .frame(width: 210)
            }
            if fieldCount >= 1 {
                TextField(fieldCount == 2 ? "From" : "Value", text: $model.value1)
                    .frame(width: 140)
            }
            if fieldCount == 2 {
                TextField("To", text: $model.value2).frame(width: 140)
            }
            if isFirst {
                Toggle("Aligned", isOn: $model.alignedScan)
                    .help("Only check addresses aligned to the value's size. Much faster; turn off if nothing is found.")
            }
            Spacer()
            if isFirst {
                Button("First scan") { model.firstScan() }.keyboardShortcut(.return).disabled(model.isScanning)
            } else {
                Button("Next scan") { model.nextScan() }.keyboardShortcut(.return).disabled(model.isScanning)
                Button("Undo scan") { model.undoScan() }.disabled(model.scanHistory.isEmpty || model.isScanning)
                Button("New scan") { model.resetScan() }.disabled(model.isScanning)
            }
        }
    }

    private var rows: [ScanRow] {
        guard let r = model.results else { return [] }
        return (0..<min(r.count, maxRows)).map { i in
            let address = r.addresses[i]
            let current = model.read(address, count: r.width).map { r.type.format($0) } ?? "unreadable"
            return ScanRow(id: i, address: address, scanned: r.type.format(r.value(at: i)), current: current)
        }
    }

    @ViewBuilder private var resultsTable: some View {
        if let r = model.results {
            Text(r.count > maxRows
                 ? "\(r.count.formatted()) matches (showing the first \(maxRows)). Keep narrowing."
                 : "\(r.count.formatted()) matches. Double-click to edit, right-click for more.")
                .foregroundStyle(.secondary)
            Table(rows, selection: $selection) {
                TableColumn("Address") { Text(hex($0.address)).monospaced().textSelection(.enabled) }
                TableColumn("At last scan") { Text($0.scanned).monospaced() }
                TableColumn("Current") { row in
                    Text(row.current).monospaced().foregroundStyle(row.current == row.scanned ? Color.primary : Color.orange)
                }
            }
            .contextMenu(forSelectionType: Int.self) { ids in
                if let id = ids.first, let row = rows.first(where: { $0.id == id }) {
                    Button("Edit value…") { edit(row, r) }
                    Button("Save…") { saveRequest = SaveRequest(address: row.address, type: r.type, textLength: r.type.isText ? r.width : nil) }
                    Button("Browse memory here") { model.browseAddress = row.address; model.pane = .memory }
                    Button("Copy address") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(hex(row.address), forType: .string)
                    }
                }
            } primaryAction: { ids in
                if let id = ids.first, let row = rows.first(where: { $0.id == id }) { edit(row, r) }
            }
        } else {
            Spacer()
        }
    }

    private func edit(_ row: ScanRow, _ r: ScanResults) {
        model.editTarget = EditTarget(label: hex(row.address), address: row.address, type: r.type, textLength: r.type.isText ? r.width : nil)
    }

    private var tips: some View {
        DisclosureGroup("Football Manager tips") {
            VStack(alignment: .leading, spacing: 4) {
                Text("• Money (bank balance, budgets, wages): try Int32, then Int64. Scan the exact amount shown, spend or earn some, then scan the new amount.")
                Text("• Attributes are stored on a 1–100 scale: a 15 in-game is roughly 71–79. Use “Between” with ×5 values (e.g. 70 and 79), then narrow after the attribute changes.")
                Text("• CA / PA are usually Int16. Use a player whose exact CA you know (e.g. after editing it once), or scan a range and narrow.")
                Text("• Once you find one value of a player, open the memory browser there: their other attributes usually sit right next to it. Save them into one group.")
                Text("• Names are usually UTF-16 text. Scanning a unique surname is a quick way to find a player's record.")
            }
            .font(.callout)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
        }
    }
}

// MARK: - Save sheet

struct SaveRequest: Identifiable {
    let id = UUID()
    var address: UInt64?
    var type: ValueType
    var textLength: Int?
}

struct SaveSheet: View {
    let request: SaveRequest
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    enum Mode: String, CaseIterable, Identifiable {
        case add = "Save as a new value", relocate = "Relocate a group (this is one of its values)"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .add
    @State private var label = ""
    @State private var addressText = ""
    @State private var type: ValueType = .int32
    @State private var textLength = ""
    @State private var groupID: UUID?
    @State private var newGroupName = ""
    @State private var relocateEntryID: UUID?

    private var groupEntries: [SavedEntry] { model.table.entries.filter { $0.groupID != nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(request.address == nil ? "Add value by address" : "Save \(hex(request.address!))").font(.title3.bold())
            if request.address != nil && !groupEntries.isEmpty {
                Picker("", selection: $mode) { ForEach(Mode.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.radioGroup)
                    .labelsHidden()
            }
            Form {
                if request.address == nil {
                    TextField("Address (hex)", text: $addressText)
                    Picker("Type", selection: $type) { ForEach(ValueType.allCases) { Text($0.displayName).tag($0) } }
                    if type.isText { TextField("Length in bytes", text: $textLength) }
                }
                if mode == .add {
                    TextField("Label", text: $label, prompt: Text("e.g. Club balance, Haaland CA"))
                    Picker("Group", selection: $groupID) {
                        Text("None (this session only)").tag(UUID?.none)
                        ForEach(model.table.groups) { Text($0.name).tag(UUID?.some($0.id)) }
                    }
                    HStack {
                        TextField("New group", text: $newGroupName, prompt: Text("e.g. Haaland, My club"))
                        Button("Create") {
                            model.addGroup(newGroupName)
                            groupID = model.table.groups.last?.id
                            newGroupName = ""
                        }
                        .disabled(newGroupName.isEmpty)
                    }
                    Text(groupID == nil
                         ? "Without a group the address is forgotten when the game restarts."
                         : "Grouped values are stored relative to each other. Next session, find any one of them and choose Relocate.")
                        .font(.caption).foregroundStyle(.secondary)
                } else {
                    Picker("This address is", selection: $relocateEntryID) {
                        Text("Choose…").tag(UUID?.none)
                        ForEach(groupEntries) { e in
                            Text("\(groupName(e)) › \(e.label)").tag(UUID?.some(e.id))
                        }
                    }
                }
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(mode == .add ? "Save" : "Relocate") { submit() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSubmit)
            }
        }
        .padding(20)
        .frame(width: 520)
        .onAppear { type = request.type }
    }

    private func groupName(_ e: SavedEntry) -> String {
        model.table.groups.first { $0.id == e.groupID }?.name ?? "?"
    }

    private var resolvedAddress: UInt64? { request.address ?? parseAddress(addressText) }

    private var canSubmit: Bool {
        guard resolvedAddress != nil else { return false }
        if mode == .relocate { return relocateEntryID != nil }
        if type.isText && request.address == nil { return Int(textLength) != nil }
        return true
    }

    private func submit() {
        guard let address = resolvedAddress else { return }
        if mode == .relocate {
            if let e = model.table.entries.first(where: { $0.id == relocateEntryID }) { model.anchor(e, at: address) }
        } else {
            let length = request.address == nil ? (type.isText ? Int(textLength) : nil) : request.textLength
            model.save(label: label, type: type, address: address, textLength: length, groupID: groupID)
        }
        dismiss()
    }
}

// MARK: - Saved values

struct SavedView: View {
    @EnvironmentObject var model: AppModel
    @State private var newGroup = ""
    @State private var addRequest: SaveRequest?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PaneHeader(
                title: "Saved values",
                subtitle: "Values update live. Grouped values survive restarts: re-find one member and relocate the group."
            )
            HStack {
                TextField("New group name", text: $newGroup).frame(width: 240)
                Button("Add group") { model.addGroup(newGroup); newGroup = "" }
                Spacer()
                Button("Add by address…") { addRequest = SaveRequest(address: nil, type: .int32) }
                    .disabled(model.memory == nil)
            }
            List {
                ForEach(model.table.groups) { group in
                    Section {
                        let entries = model.table.entries.filter { $0.groupID == group.id }
                        if entries.isEmpty {
                            Text("Empty. Save values into this group from the Scanner or Memory browser.").foregroundStyle(.secondary)
                        }
                        ForEach(entries) { SavedRow(entry: $0) }
                    } header: {
                        HStack {
                            Text(group.name).font(.headline)
                            if let base = group.baseAddress, group.baseSessionID == model.session {
                                Text("base \(hex(base))").monospaced().foregroundStyle(.secondary)
                            } else {
                                Text("not located this session").foregroundStyle(.orange)
                            }
                            Spacer()
                            Button(role: .destructive) { model.deleteGroup(group) } label: { Image(systemName: "trash") }
                                .buttonStyle(.borderless)
                        }
                    }
                }
                let loose = model.table.entries.filter { $0.groupID == nil }
                if !loose.isEmpty {
                    Section("Ungrouped (this session only)") {
                        ForEach(loose) { SavedRow(entry: $0) }
                    }
                }
            }
        }
        .padding(20)
        .sheet(item: $addRequest) { SaveSheet(request: $0).environmentObject(model) }
    }
}

struct SavedRow: View {
    let entry: SavedEntry
    @EnvironmentObject var model: AppModel

    var body: some View {
        let address = model.address(of: entry)
        HStack(spacing: 12) {
            Text(entry.label).frame(width: 200, alignment: .leading).lineLimit(1)
            Text(entry.type.rawValue).foregroundStyle(.secondary).frame(width: 60, alignment: .leading)
            if entry.groupID != nil {
                Text(entry.offset >= 0 ? "+\(entry.offset)" : "\(entry.offset)").monospaced().foregroundStyle(.secondary).frame(width: 70, alignment: .leading)
            }
            Text(address.map(hex) ?? "—").monospaced().frame(width: 140, alignment: .leading)
            Text(model.liveValues[entry.id] ?? "—").monospaced().bold().frame(minWidth: 100, alignment: .leading)
            Spacer()
            Toggle("Freeze", isOn: Binding(get: { model.frozen[entry.id] != nil }, set: { _ in model.toggleFreeze(entry) }))
                .toggleStyle(.checkbox)
                .disabled(address == nil)
                .help("Keep rewriting the current value so the game can't change it.")
            Button("Edit…") { model.edit(entry) }.disabled(address == nil)
            Button { if let a = address { model.browseAddress = a; model.pane = .memory } } label: { Image(systemName: "square.grid.3x3") }
                .disabled(address == nil)
                .help("Browse memory here")
            Button(role: .destructive) { model.delete(entry) } label: { Image(systemName: "trash") }
                .buttonStyle(.borderless)
        }
    }
}

// MARK: - Edit sheet (preview → verify → apply)

struct EditSheet: View {
    let target: EditTarget
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var newValue = ""
    @State private var pending: PendingEdit?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Edit \(target.label)").font(.title3.bold())
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                GridRow { Text("Address").foregroundStyle(.secondary); Text(hex(target.address)).monospaced() }
                GridRow { Text("Type").foregroundStyle(.secondary); Text(target.type.displayName) }
                GridRow { Text("Current").foregroundStyle(.secondary); Text(currentText).monospaced().bold() }
            }
            TextField("New value", text: $newValue)
                .onChange(of: newValue) { _, _ in pending = nil; error = nil }
                .onSubmit(primary)

            if let p = pending {
                GroupBox("Preview") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(p.oldText)  →  \(p.newText)").font(.title3.monospaced())
                        Text("\(hexBytes(p.snapshot))  →  \(hexBytes(p.newBytes))").monospaced().font(.caption).foregroundStyle(.secondary)
                        Text("When you apply, the value is checked again. If the game changed it since this preview, nothing is written. After writing, it is read back to verify, and can be undone from History.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if let error {
                Label(error, systemImage: "xmark.octagon.fill").foregroundStyle(.red).textSelection(.enabled)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(pending == nil ? "Preview" : "Apply", action: primary).keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 480)
        .onAppear { newValue = currentText == "unreadable" ? "" : currentText }
    }

    private var width: Int { target.type.fixedWidth ?? target.textLength ?? 0 }

    private var currentText: String {
        model.read(target.address, count: width).map { target.type.format($0) } ?? "unreadable"
    }

    private func primary() {
        do {
            if let p = pending {
                try model.commit(p)
                dismiss()
            } else {
                pending = try model.preview(target, newValue: newValue)
            }
        } catch {
            pending = nil
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Memory browser

struct MemoryView: View {
    @EnvironmentObject var model: AppModel
    @State private var addressText = ""
    @State private var selected: UInt64?
    @State private var saveRequest: SaveRequest?
    private let rowCount = 24

    var body: some View {
        if model.memory == nil { NotConnected() } else { content }
    }

    private var origin: UInt64? {
        guard let a = model.browseAddress else { return nil }
        let aligned = a & ~UInt64(0xF)
        return aligned >= 128 ? aligned - 128 : 0
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            PaneHeader(title: "Memory browser", subtitle: "Click a byte to see it as every type. A player's attributes usually sit next to each other here.")
            HStack {
                TextField("Address (hex)", text: $addressText).frame(width: 200).onSubmit(go)
                Button("Go", action: go)
                Button { shift(-256) } label: { Image(systemName: "chevron.up") }.help("Back 256 bytes")
                Button { shift(256) } label: { Image(systemName: "chevron.down") }.help("Forward 256 bytes")
                Spacer()
            }
            if let origin {
                HStack(alignment: .top, spacing: 20) {
                    TimelineView(.periodic(from: .now, by: 0.5)) { _ in grid(origin) }
                    if let selected { inspector(selected) }
                }
            } else {
                Text("Enter an address, or choose “Browse memory here” on a scan result or saved value.").foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .onAppear { if let a = model.browseAddress { addressText = hex(a); selected = a } }
        .onChange(of: model.browseAddress) { _, a in if let a { addressText = hex(a); selected = a } }
        .sheet(item: $saveRequest) { SaveSheet(request: $0).environmentObject(model) }
    }

    private func go() {
        if let a = parseAddress(addressText) { model.browseAddress = a; selected = a }
    }

    private func shift(_ delta: Int64) {
        guard let a = model.browseAddress else { return }
        model.browseAddress = UInt64(bitPattern: max(0, Int64(bitPattern: a) + delta))
    }

    private func grid(_ origin: UInt64) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(0..<rowCount, id: \.self) { r in
                let rowAddress = origin + UInt64(r * 16)
                let bytes = model.read(rowAddress, count: 16)
                HStack(spacing: 4) {
                    Text(hex(rowAddress)).monospaced().foregroundStyle(.secondary).frame(width: 130, alignment: .leading)
                    ForEach(0..<16, id: \.self) { c in
                        let a = rowAddress + UInt64(c)
                        Text(bytes.map { String(format: "%02X", $0[c]) } ?? "??")
                            .monospaced()
                            .padding(.horizontal, 2)
                            .background(a == selected ? Color.accentColor.opacity(0.35) : (a == model.browseAddress ? Color.yellow.opacity(0.25) : Color.clear))
                            .onTapGesture { selected = a }
                            .padding(.trailing, c == 7 ? 6 : 0)
                    }
                    Text(bytes.map { String($0.map { (32...126).contains($0) ? Character(UnicodeScalar($0)) : "." }) } ?? "")
                        .monospaced().foregroundStyle(.secondary).padding(.leading, 8)
                }
                .font(.system(size: 12))
            }
        }
    }

    private func inspector(_ address: UInt64) -> some View {
        let numeric = ValueType.allCases.filter(\.isNumeric)
        return VStack(alignment: .leading, spacing: 8) {
            Text(hex(address)).font(.headline.monospaced())
            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 4) {
                ForEach(numeric) { t in
                    GridRow {
                        Text(t.rawValue).foregroundStyle(.secondary)
                        Text(model.read(address, count: t.fixedWidth!).map { t.format($0) } ?? "—").monospaced()
                        Button("Edit") {
                            model.editTarget = EditTarget(label: hex(address), address: address, type: t, textLength: nil)
                        }
                        .controlSize(.small)
                        Button("Save") { saveRequest = SaveRequest(address: address, type: t) }
                            .controlSize(.small)
                    }
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.08)))
        .frame(width: 330)
    }
}

// MARK: - History

struct HistoryView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PaneHeader(
                title: "History",
                subtitle: "Every applied change this session. Undo only restores the old value if the game hasn't changed it since."
            )
            if model.journal.isEmpty {
                Text("No changes yet.").foregroundStyle(.secondary)
                Spacer()
            } else {
                List(Array(model.journal.reversed())) { e in
                    HStack(spacing: 12) {
                        Text(e.date, style: .time).foregroundStyle(.secondary).frame(width: 80, alignment: .leading)
                        Text(e.label).frame(width: 200, alignment: .leading).lineLimit(1)
                        Text(hex(e.address)).monospaced().foregroundStyle(.secondary).frame(width: 140, alignment: .leading)
                        Text("\(e.type.format(e.oldBytes)) → \(e.type.format(e.newBytes))").monospaced()
                        Spacer()
                        if e.undone {
                            Text("Undone").foregroundStyle(.secondary)
                        } else {
                            Button("Undo") { model.undo(e) }
                        }
                    }
                }
            }
        }
        .padding(20)
    }
}
#endif
