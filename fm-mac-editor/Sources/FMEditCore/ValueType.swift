import Foundation

/// How a run of bytes in the game's memory is interpreted.
/// macOS on both Apple Silicon and Intel is little-endian, so everything is encoded little-endian.
public enum ValueType: String, Codable, CaseIterable, Identifiable, Sendable {
    case int8, int16, int32, int64
    case uint8, uint16, uint32, uint64
    case float, double
    case utf8, utf16

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .int8: return "Int8 (1 byte)"
        case .int16: return "Int16 (2 bytes)"
        case .int32: return "Int32 (4 bytes)"
        case .int64: return "Int64 (8 bytes)"
        case .uint8: return "UInt8 (1 byte)"
        case .uint16: return "UInt16 (2 bytes)"
        case .uint32: return "UInt32 (4 bytes)"
        case .uint64: return "UInt64 (8 bytes)"
        case .float: return "Float (4 bytes)"
        case .double: return "Double (8 bytes)"
        case .utf8: return "Text UTF-8"
        case .utf16: return "Text UTF-16"
        }
    }

    /// Fixed byte width, or nil for text (whose width comes from the value itself).
    public var fixedWidth: Int? {
        switch self {
        case .int8, .uint8: return 1
        case .int16, .uint16: return 2
        case .int32, .uint32, .float: return 4
        case .int64, .uint64, .double: return 8
        case .utf8, .utf16: return nil
        }
    }

    public var isText: Bool { fixedWidth == nil }
    public var isNumeric: Bool { !isText }
    public var isFloatingPoint: Bool { self == .float || self == .double }

    /// Natural alignment used by "aligned" scans.
    public var naturalAlignment: Int {
        switch self {
        case .utf8: return 1
        case .utf16: return 2
        default: return fixedWidth!
        }
    }

    /// Parses user text into the bytes this type stores in memory.
    public func encode(_ text: String) throws -> [UInt8] {
        let t = text.trimmingCharacters(in: .whitespaces)
        func int<T: FixedWidthInteger>(_: T.Type) throws -> [UInt8] {
            let cleaned = t.replacingOccurrences(of: ",", with: "").replacingOccurrences(of: "_", with: "")
            let value: T?
            if cleaned.lowercased().hasPrefix("0x") {
                value = T(cleaned.dropFirst(2), radix: 16)
            } else if cleaned.lowercased().hasPrefix("-0x") {
                value = T("-" + cleaned.dropFirst(3), radix: 16)
            } else {
                value = T(cleaned)
            }
            guard let v = value else { throw ValueError.invalid(text, self) }
            return withUnsafeBytes(of: v.littleEndian) { Array($0) }
        }
        switch self {
        case .int8: return try int(Int8.self)
        case .int16: return try int(Int16.self)
        case .int32: return try int(Int32.self)
        case .int64: return try int(Int64.self)
        case .uint8: return try int(UInt8.self)
        case .uint16: return try int(UInt16.self)
        case .uint32: return try int(UInt32.self)
        case .uint64: return try int(UInt64.self)
        case .float:
            guard let v = Float(t.replacingOccurrences(of: ",", with: "")) else { throw ValueError.invalid(text, self) }
            return withUnsafeBytes(of: v.bitPattern.littleEndian) { Array($0) }
        case .double:
            guard let v = Double(t.replacingOccurrences(of: ",", with: "")) else { throw ValueError.invalid(text, self) }
            return withUnsafeBytes(of: v.bitPattern.littleEndian) { Array($0) }
        case .utf8:
            guard !text.isEmpty else { throw ValueError.invalid(text, self) }
            return Array(text.utf8)
        case .utf16:
            guard !text.isEmpty else { throw ValueError.invalid(text, self) }
            return text.utf16.flatMap { unit in withUnsafeBytes(of: unit.littleEndian) { Array($0) } }
        }
    }

    /// Numeric value of the bytes at `pointer` (must have at least `fixedWidth` bytes). Nil for text.
    public func number(at pointer: UnsafeRawPointer) -> Double? {
        switch self {
        case .int8: return Double(pointer.loadUnaligned(as: Int8.self))
        case .int16: return Double(Int16(littleEndian: pointer.loadUnaligned(as: Int16.self)))
        case .int32: return Double(Int32(littleEndian: pointer.loadUnaligned(as: Int32.self)))
        case .int64: return Double(Int64(littleEndian: pointer.loadUnaligned(as: Int64.self)))
        case .uint8: return Double(pointer.loadUnaligned(as: UInt8.self))
        case .uint16: return Double(UInt16(littleEndian: pointer.loadUnaligned(as: UInt16.self)))
        case .uint32: return Double(UInt32(littleEndian: pointer.loadUnaligned(as: UInt32.self)))
        case .uint64: return Double(UInt64(littleEndian: pointer.loadUnaligned(as: UInt64.self)))
        case .float: return Double(Float(bitPattern: UInt32(littleEndian: pointer.loadUnaligned(as: UInt32.self))))
        case .double: return Double(bitPattern: UInt64(littleEndian: pointer.loadUnaligned(as: UInt64.self)))
        case .utf8, .utf16: return nil
        }
    }

    public func number(_ bytes: [UInt8]) -> Double? {
        guard let w = fixedWidth, bytes.count >= w else { return nil }
        return bytes.withUnsafeBytes { number(at: $0.baseAddress!) }
    }

    /// Human-readable rendering of stored bytes (exact for integers, no rounding through Double).
    public func format(_ bytes: [UInt8]) -> String {
        if let w = fixedWidth, bytes.count < w { return "?" }
        return bytes.withUnsafeBytes { raw -> String in
            let p = raw.baseAddress!
            switch self {
            case .int8: return String(p.loadUnaligned(as: Int8.self))
            case .int16: return String(Int16(littleEndian: p.loadUnaligned(as: Int16.self)))
            case .int32: return String(Int32(littleEndian: p.loadUnaligned(as: Int32.self)))
            case .int64: return String(Int64(littleEndian: p.loadUnaligned(as: Int64.self)))
            case .uint8: return String(p.loadUnaligned(as: UInt8.self))
            case .uint16: return String(UInt16(littleEndian: p.loadUnaligned(as: UInt16.self)))
            case .uint32: return String(UInt32(littleEndian: p.loadUnaligned(as: UInt32.self)))
            case .uint64: return String(UInt64(littleEndian: p.loadUnaligned(as: UInt64.self)))
            case .float: return String(Float(bitPattern: UInt32(littleEndian: p.loadUnaligned(as: UInt32.self))))
            case .double: return String(Double(bitPattern: UInt64(littleEndian: p.loadUnaligned(as: UInt64.self))))
            case .utf8: return String(decoding: bytes, as: UTF8.self)
            case .utf16:
                let units = stride(from: 0, to: bytes.count - 1, by: 2).map { UInt16(bytes[$0]) | UInt16(bytes[$0 + 1]) << 8 }
                return String(decoding: units, as: UTF16.self)
            }
        }
    }
}

public enum ValueError: Error, LocalizedError, Equatable {
    case invalid(String, ValueType)
    case textLengthMismatch(expected: Int, got: Int)

    public var errorDescription: String? {
        switch self {
        case let .invalid(text, type): return "\"\(text)\" is not a valid \(type.displayName) value."
        case let .textLengthMismatch(expected, got):
            return "Text must fit in the original \(expected) bytes (new text is \(got) bytes)."
        }
    }
}

public func hex(_ address: UInt64) -> String { "0x" + String(address, radix: 16, uppercase: true) }

public func parseAddress(_ text: String) -> UInt64? {
    var t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "_", with: "")
    if t.lowercased().hasPrefix("0x") { t = String(t.dropFirst(2)) }
    return UInt64(t, radix: 16)
}

public func hexBytes(_ bytes: [UInt8]) -> String {
    bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
}
