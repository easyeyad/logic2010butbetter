import Foundation

/// A value you found and want to keep.
/// If it belongs to a group, `offset` is relative to the group's base; otherwise `offset` is an absolute address.
public struct SavedEntry: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID()
    public var label: String
    public var type: ValueType
    public var offset: Int64
    /// Byte length for text entries.
    public var textLength: Int?
    public var groupID: UUID?

    public init(label: String, type: ValueType, offset: Int64, textLength: Int? = nil, groupID: UUID? = nil) {
        self.label = label
        self.type = type
        self.offset = offset
        self.textLength = textLength
        self.groupID = groupID
    }

    public var width: Int { type.fixedWidth ?? textLength ?? 0 }
}

/// A set of values laid out at fixed offsets from one base (e.g. one player's record).
/// Absolute addresses move every launch, offsets inside a record don't: re-find the base, and every entry follows.
public struct SavedGroup: Codable, Identifiable, Equatable, Sendable {
    public var id = UUID()
    public var name: String
    public var notes: String = ""
    /// Valid only for `baseSessionID`; cleared automatically when the game restarts.
    public var baseAddress: UInt64?
    public var baseSessionID: Int32?

    public init(name: String) { self.name = name }
}

public struct SavedTable: Codable, Equatable, Sendable {
    public var groups: [SavedGroup] = []
    public var entries: [SavedEntry] = []
    /// Session that standalone (absolute) entries were found in.
    public var looseSessionID: Int32?

    public init() {}

    /// Absolute address of an entry in the given session, or nil if its base isn't known for that session.
    public func address(of entry: SavedEntry, session: Int32?) -> UInt64? {
        guard let session else { return nil }
        if let gid = entry.groupID {
            guard let g = groups.first(where: { $0.id == gid }), let base = g.baseAddress, g.baseSessionID == session else { return nil }
            return UInt64(bitPattern: Int64(bitPattern: base) &+ entry.offset)
        }
        return looseSessionID == session ? UInt64(bitPattern: entry.offset) : nil
    }

    /// Sets a group's base so that `entry` lands exactly at `address`.
    public mutating func anchor(groupID: UUID, entry: SavedEntry, at address: UInt64, session: Int32) {
        guard let i = groups.firstIndex(where: { $0.id == groupID }) else { return }
        groups[i].baseAddress = UInt64(bitPattern: Int64(bitPattern: address) &- entry.offset)
        groups[i].baseSessionID = session
    }

    /// Adds an address found by scanning. With a group whose base is known, it's stored as an offset.
    public mutating func add(label: String, type: ValueType, address: UInt64, textLength: Int?, groupID: UUID?, session: Int32) {
        if let gid = groupID, let i = groups.firstIndex(where: { $0.id == gid }) {
            if groups[i].baseAddress == nil || groups[i].baseSessionID != session {
                // First member defines the base.
                groups[i].baseAddress = address
                groups[i].baseSessionID = session
            }
            let offset = Int64(bitPattern: address) &- Int64(bitPattern: groups[i].baseAddress!)
            entries.append(SavedEntry(label: label, type: type, offset: offset, textLength: textLength, groupID: gid))
        } else {
            if looseSessionID != session {
                // Old absolute addresses are meaningless in a new session.
                entries.removeAll { $0.groupID == nil }
                looseSessionID = session
            }
            entries.append(SavedEntry(label: label, type: type, offset: Int64(bitPattern: address), textLength: textLength))
        }
    }

    // MARK: Persistence

    public static func load(from url: URL) -> SavedTable {
        guard let data = try? Data(contentsOf: url),
              let table = try? JSONDecoder().decode(SavedTable.self, from: data) else { return SavedTable() }
        return table
    }

    public func save(to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: .atomic)
    }
}
