#if os(macOS)
import AppKit
import FMEditCore
import SwiftUI

struct GameProcess: Identifiable, Hashable {
    let pid: Int32
    let name: String
    let path: String
    var id: Int32 { pid }
    var looksLikeFM: Bool { name.localizedCaseInsensitiveContains("football manager") || name.lowercased().hasPrefix("fm") }
}

enum FirstScanKind: String, CaseIterable, Identifiable {
    case exact = "Exact value", between = "Between"
    var id: String { rawValue }
}

enum NextScanKind: String, CaseIterable, Identifiable {
    case exact = "Exact value", between = "Between", changed = "Changed", unchanged = "Unchanged"
    case increased = "Increased", decreased = "Decreased", increasedBy = "Increased by", decreasedBy = "Decreased by"
    var id: String { rawValue }
    var valueFields: Int {
        switch self {
        case .between: return 2
        case .exact, .increasedBy, .decreasedBy: return 1
        default: return 0
        }
    }
}

/// What the edit sheet is editing.
struct EditTarget: Identifiable {
    let id = UUID()
    let label: String
    let address: UInt64
    let type: ValueType
    let textLength: Int?
}

@MainActor
final class AppModel: ObservableObject {
    // Connection
    @Published var processes: [GameProcess] = []
    @Published private(set) var memory: MachMemory?
    @Published private(set) var attachedName = ""
    @Published var status = "Not connected"
    @Published var lastError: String?

    // Scanner
    @Published var scanType: ValueType = .int32
    @Published var firstKind: FirstScanKind = .exact
    @Published var nextKind: NextScanKind = .exact
    @Published var value1 = ""
    @Published var value2 = ""
    @Published var alignedScan = true
    @Published private(set) var results: ScanResults?
    @Published private(set) var scanHistory: [ScanResults] = []
    @Published private(set) var isScanning = false
    @Published var progress = 0.0

    // Saved values, edits, history
    @Published var table: SavedTable { didSet { saveTable() } }
    @Published private(set) var liveValues: [UUID: String] = [:]
    @Published private(set) var frozen: [UUID: [UInt8]] = [:]
    @Published private(set) var journal: [JournalEntry] = []
    @Published var editTarget: EditTarget?
    @Published var browseAddress: UInt64?
    @Published var pane: Pane = .connect
    private(set) var engine: EditEngine?

    private var timer: Timer?
    private let tableURL: URL

    init() {
        tableURL = AppModel.supportDirectory().appendingPathComponent("saved-values.json")
        table = SavedTable.load(from: tableURL)
        refreshProcesses()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main
        ) { [weak self] note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            let pid = app?.processIdentifier
            Task { @MainActor in
                guard let self else { return }
                if pid == self.memory?.pid { self.detach(reason: "Football Manager quit. Session closed; re-attach after relaunching.") }
                self.refreshProcesses()
            }
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.refreshProcesses() }
        }
    }

    var session: Int32? { memory?.sessionID }

    // MARK: Connection

    func refreshProcesses() {
        processes = NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular && $0.processIdentifier != getpid() }
            .map { GameProcess(pid: $0.processIdentifier, name: $0.localizedName ?? "pid \($0.processIdentifier)", path: $0.bundleURL?.path ?? "") }
            .sorted { ($0.looksLikeFM ? 0 : 1, $0.name) < ($1.looksLikeFM ? 0 : 1, $1.name) }
    }

    func attach(_ process: GameProcess) {
        detach(reason: nil)
        do {
            let m = try MachMemory(pid: process.pid)
            memory = m
            engine = EditEngine(memory: m)
            attachedName = process.name
            status = "Connected to \(process.name) (pid \(process.pid))"
            lastError = nil
            pane = .scanner
        } catch {
            lastError = error.localizedDescription
            status = "Not connected"
        }
    }

    func detach(reason: String?) {
        cancelFlag.value = true
        memory = nil
        engine = nil
        journal = []
        results = nil
        scanHistory = []
        frozen = [:]
        liveValues = [:]
        attachedName = ""
        status = reason ?? "Not connected"
    }

    // MARK: Scanning

    func firstScan() {
        guard let memory else { return }
        let condition: ScanCondition = firstKind == .exact ? .exact(value1) : .between(value1, value2)
        let type = scanType, aligned = alignedScan
        runScan { [memory] progress in
            try Scanner(memory: memory).firstScan(type: type, condition: condition, aligned: aligned, progress: progress)
        } onDone: { [weak self] r in
            self?.scanHistory = []
            self?.results = r
        }
    }

    func nextScan() {
        guard let memory, let previous = results else { return }
        let condition: ScanCondition
        switch nextKind {
        case .exact: condition = .exact(value1)
        case .between: condition = .between(value1, value2)
        case .changed: condition = .changed
        case .unchanged: condition = .unchanged
        case .increased: condition = .increased
        case .decreased: condition = .decreased
        case .increasedBy: condition = .increasedBy(value1)
        case .decreasedBy: condition = .decreasedBy(value1)
        }
        runScan { [memory] progress in
            try Scanner(memory: memory).nextScan(previous, condition: condition, progress: progress)
        } onDone: { [weak self] r in
            self?.scanHistory.append(previous)
            self?.results = r
        }
    }

    func undoScan() {
        guard let last = scanHistory.popLast() else { return }
        results = last
    }

    func resetScan() {
        results = nil
        scanHistory = []
    }

    func stopScan() { cancelFlag.value = true }

    private func runScan(_ work: @escaping @Sendable (@escaping (Double) -> Bool) throws -> ScanResults,
                         onDone: @escaping @MainActor (ScanResults) -> Void) {
        isScanning = true
        cancelFlag.value = false
        progress = 0
        lastError = nil
        Task.detached { [weak self] in
            let result: Result<ScanResults, Error> = Result {
                try work { fraction in
                    Task { @MainActor in self?.progress = fraction }
                    return !(self?.cancelFlag.value ?? true)
                }
            }
            await MainActor.run {
                guard let self else { return }
                self.isScanning = false
                switch result {
                case let .success(r):
                    onDone(r)
                    if r.truncated { self.lastError = "Too many matches; showing the first \(r.count). Scan for something more specific." }
                case let .failure(e): self.lastError = e.localizedDescription
                }
            }
        }
    }

    /// Set to stop a running scan; read from the background scan thread.
    nonisolated let cancelFlag = AtomicFlag()

    // MARK: Saved values

    func addGroup(_ name: String) {
        table.groups.append(SavedGroup(name: name.isEmpty ? "Group" : name))
    }

    func save(label: String, type: ValueType, address: UInt64, textLength: Int?, groupID: UUID?) {
        guard let session else { return }
        table.add(label: label.isEmpty ? hex(address) : label, type: type, address: address, textLength: textLength, groupID: groupID, session: session)
    }

    func address(of entry: SavedEntry) -> UInt64? { table.address(of: entry, session: session) }

    func anchor(_ entry: SavedEntry, at address: UInt64) {
        guard let gid = entry.groupID, let session else { return }
        table.anchor(groupID: gid, entry: entry, at: address, session: session)
    }

    func delete(_ entry: SavedEntry) {
        table.entries.removeAll { $0.id == entry.id }
        frozen[entry.id] = nil
    }

    func deleteGroup(_ group: SavedGroup) {
        for e in table.entries where e.groupID == group.id { frozen[e.id] = nil }
        table.entries.removeAll { $0.groupID == group.id }
        table.groups.removeAll { $0.id == group.id }
    }

    func toggleFreeze(_ entry: SavedEntry) {
        if frozen[entry.id] != nil { frozen[entry.id] = nil; return }
        guard let memory, let a = address(of: entry), let bytes = try? memory.read(a, count: entry.width) else { return }
        frozen[entry.id] = bytes
    }

    func edit(_ entry: SavedEntry) {
        guard let a = address(of: entry) else { return }
        editTarget = EditTarget(label: entry.label, address: a, type: entry.type, textLength: entry.textLength)
    }

    // MARK: Edits

    func preview(_ target: EditTarget, newValue: String) throws -> PendingEdit {
        guard let engine else { throw EditError.processGone }
        return try engine.preview(label: target.label, address: target.address, type: target.type, newValue: newValue, textLength: target.textLength)
    }

    func commit(_ edit: PendingEdit) throws {
        guard let engine else { throw EditError.processGone }
        try engine.commit(edit)
        journal = engine.journal
    }

    func undo(_ entry: JournalEntry) {
        guard let engine else { return }
        do {
            try engine.undo(entry.id)
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
        journal = engine.journal
    }

    func read(_ address: UInt64, count: Int) -> [UInt8]? { try? memory?.read(address, count: count) }

    // MARK: Timer: live values + freezes

    private func tick() {
        guard let memory else { return }
        if !memory.isAlive { detach(reason: "Football Manager quit. Session closed."); return }
        for (id, bytes) in frozen {
            guard let entry = table.entries.first(where: { $0.id == id }), let a = address(of: entry) else { continue }
            if read(a, count: bytes.count) != bytes { try? memory.write(a, bytes: bytes) }
        }
        var values: [UUID: String] = [:]
        for entry in table.entries {
            guard let a = address(of: entry), let bytes = read(a, count: entry.width) else { continue }
            values[entry.id] = entry.type.format(bytes)
        }
        if values != liveValues { liveValues = values }
    }

    // MARK: Persistence

    private func saveTable() {
        try? table.save(to: tableURL)
        AppModel.giveBackToSudoUser(tableURL)
    }

    /// Under `sudo`, store data in the real user's home, not root's, and keep the files owned by them.
    static func supportDirectory() -> URL {
        var home = URL(fileURLWithPath: NSHomeDirectory())
        if let user = ProcessInfo.processInfo.environment["SUDO_USER"], !user.isEmpty {
            home = URL(fileURLWithPath: "/Users/\(user)")
        }
        return home.appendingPathComponent("Library/Application Support/FMMacEditor")
    }

    static func giveBackToSudoUser(_ url: URL) {
        let env = ProcessInfo.processInfo.environment
        guard let uid = env["SUDO_UID"].flatMap(UInt32.init), let gid = env["SUDO_GID"].flatMap(UInt32.init) else { return }
        chown(url.deletingLastPathComponent().path, uid, gid)
        chown(url.path, uid, gid)
    }
}

final class AtomicFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var _value = false
    var value: Bool {
        get { lock.lock(); defer { lock.unlock() }; return _value }
        set { lock.lock(); _value = newValue; lock.unlock() }
    }
}
#endif
