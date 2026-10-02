import Foundation

public struct MemoryRegion: Equatable, Sendable {
    public var start: UInt64
    public var size: UInt64
    public var readable: Bool
    public var writable: Bool

    public init(start: UInt64, size: UInt64, readable: Bool = true, writable: Bool = true) {
        self.start = start
        self.size = size
        self.readable = readable
        self.writable = writable
    }

    public var end: UInt64 { start + size }
}

/// Access to another process's memory. `MachMemory` is the real macOS implementation;
/// tests use an in-memory fake.
public protocol MemoryAccess: AnyObject {
    /// Identity of the attached session (the process id). Edits are only valid within one session.
    var sessionID: Int32 { get }
    func regions() -> [MemoryRegion]
    /// Fills `buffer` from `address`. Throws if any part cannot be read.
    func read(_ address: UInt64, into buffer: UnsafeMutableRawBufferPointer) throws
    func write(_ address: UInt64, bytes: [UInt8]) throws
    /// False once the target process has gone away.
    var isAlive: Bool { get }
}

public extension MemoryAccess {
    func read(_ address: UInt64, count: Int) throws -> [UInt8] {
        var out = [UInt8](repeating: 0, count: count)
        try out.withUnsafeMutableBytes { try read(address, into: $0) }
        return out
    }
}

public enum MemoryError: Error, LocalizedError, Equatable {
    case unreadable(UInt64)
    case unwritable(UInt64)

    public var errorDescription: String? {
        switch self {
        case let .unreadable(a): return "Memory at \(hex(a)) could not be read."
        case let .unwritable(a): return "Memory at \(hex(a)) could not be written."
        }
    }
}
