import Foundation

/// A change that has been previewed but not written. `snapshot` is what memory held at preview time.
public struct PendingEdit: Identifiable, Equatable, Sendable {
    public let id = UUID()
    public let sessionID: Int32
    public let label: String
    public let address: UInt64
    public let type: ValueType
    public let snapshot: [UInt8]
    public let newBytes: [UInt8]

    public var oldText: String { type.format(snapshot) }
    public var newText: String { type.format(newBytes) }
}

/// A committed, verified write. Undo restores `oldBytes` only if memory still holds `newBytes`.
public struct JournalEntry: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let date: Date
    public let sessionID: Int32
    public let label: String
    public let address: UInt64
    public let type: ValueType
    public let oldBytes: [UInt8]
    public let newBytes: [UInt8]
    public internal(set) var undone = false
}

public enum EditError: Error, LocalizedError, Equatable {
    case sessionChanged
    case processGone
    case stale(expected: [UInt8], actual: [UInt8])
    case readBackMismatch(wrote: [UInt8], readBack: [UInt8])
    case alreadyUndone
    case unknownEntry

    public var errorDescription: String? {
        switch self {
        case .sessionChanged: return "This edit belongs to a different game session. Re-find the value and try again."
        case .processGone: return "Football Manager is no longer running."
        case let .stale(expected, actual):
            return "The value changed since it was previewed (expected \(hexBytes(expected)), found \(hexBytes(actual))). Nothing was written."
        case let .readBackMismatch(wrote, readBack):
            return "Write could not be verified (wrote \(hexBytes(wrote)), read back \(hexBytes(readBack))). The original value was restored."
        case .alreadyUndone: return "That change was already undone."
        case .unknownEntry: return "That change is not in this session's history."
        }
    }
}

/// Every write goes: preview (snapshot) → compare-and-swap check → write → byte-level read-back → journal.
public final class EditEngine {
    public let memory: MemoryAccess
    public private(set) var journal: [JournalEntry] = []

    public init(memory: MemoryAccess) { self.memory = memory }

    /// Reads the current value and prepares a change. Nothing is written.
    public func preview(label: String, address: UInt64, type: ValueType, newValue: String, textLength: Int? = nil) throws -> PendingEdit {
        guard memory.isAlive else { throw EditError.processGone }
        var newBytes = try type.encode(newValue)
        let width: Int
        if type.isText {
            let original = textLength ?? newBytes.count
            guard newBytes.count <= original else {
                throw ValueError.textLengthMismatch(expected: original, got: newBytes.count)
            }
            newBytes += [UInt8](repeating: 0, count: original - newBytes.count)
            width = original
        } else {
            width = type.fixedWidth!
        }
        let snapshot = try memory.read(address, count: width)
        return PendingEdit(sessionID: memory.sessionID, label: label, address: address, type: type, snapshot: snapshot, newBytes: newBytes)
    }

    @discardableResult
    public func commit(_ edit: PendingEdit) throws -> JournalEntry {
        try swap(address: edit.address, expect: edit.snapshot, write: edit.newBytes, session: edit.sessionID)
        let entry = JournalEntry(
            id: edit.id, date: Date(), sessionID: edit.sessionID, label: edit.label,
            address: edit.address, type: edit.type, oldBytes: edit.snapshot, newBytes: edit.newBytes
        )
        journal.append(entry)
        return entry
    }

    public func undo(_ id: UUID) throws {
        guard let index = journal.firstIndex(where: { $0.id == id }) else { throw EditError.unknownEntry }
        let entry = journal[index]
        guard !entry.undone else { throw EditError.alreadyUndone }
        try swap(address: entry.address, expect: entry.newBytes, write: entry.oldBytes, session: entry.sessionID)
        journal[index].undone = true
    }

    private func swap(address: UInt64, expect: [UInt8], write: [UInt8], session: Int32) throws {
        guard session == memory.sessionID else { throw EditError.sessionChanged }
        guard memory.isAlive else { throw EditError.processGone }
        let current = try memory.read(address, count: expect.count)
        guard current == expect else { throw EditError.stale(expected: expect, actual: current) }
        try memory.write(address, bytes: write)
        let readBack = try memory.read(address, count: write.count)
        guard readBack == write else {
            try? memory.write(address, bytes: expect)
            throw EditError.readBackMismatch(wrote: write, readBack: readBack)
        }
    }
}
