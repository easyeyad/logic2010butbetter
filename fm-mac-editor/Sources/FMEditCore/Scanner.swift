import Foundation

/// What a scan keeps. First scans may only use `.exact` / `.between`; next scans may use anything.
public enum ScanCondition: Equatable, Sendable {
    case exact(String)
    case between(String, String)
    case changed
    case unchanged
    case increased
    case decreased
    case increasedBy(String)
    case decreasedBy(String)

    public var needsPrevious: Bool {
        switch self {
        case .exact, .between: return false
        default: return true
        }
    }
}

/// Addresses that survived a scan, plus the bytes each one held at scan time.
public struct ScanResults: Sendable {
    public let type: ValueType
    public let width: Int
    public internal(set) var addresses: [UInt64] = []
    /// Flat buffer, `width` bytes per address.
    public internal(set) var values: [UInt8] = []
    /// True if the result cap was hit; narrow the search with another first scan.
    public internal(set) var truncated = false

    public var count: Int { addresses.count }

    public func value(at index: Int) -> [UInt8] {
        Array(values[(index * width)..<((index + 1) * width)])
    }

    mutating func append(_ address: UInt64, _ pointer: UnsafeRawPointer) {
        addresses.append(address)
        values.append(contentsOf: UnsafeRawBufferPointer(start: pointer, count: width))
    }
}

public enum ScanError: Error, LocalizedError, Equatable {
    case needsPreviousScan
    case unsupported(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .needsPreviousScan: return "Run a first scan before comparing against previous values."
        case let .unsupported(why): return why
        case .cancelled: return "Scan cancelled."
        }
    }
}

public final class Scanner: @unchecked Sendable {
    public let memory: MemoryAccess
    public var chunkSize = 4 << 20
    public var resultCap = 20_000_000

    public init(memory: MemoryAccess) { self.memory = memory }

    /// Scans every writable region for values matching `condition`.
    /// `progress` gets 0...1 and returns false to cancel.
    public func firstScan(
        type: ValueType,
        condition: ScanCondition,
        aligned: Bool = true,
        progress: (Double) -> Bool = { _ in true }
    ) throws -> ScanResults {
        if condition.needsPrevious { throw ScanError.needsPreviousScan }
        let matcher = try Matcher(type: type, condition: condition)
        var results = ScanResults(type: type, width: matcher.width)
        let width = matcher.width
        let alignment = aligned ? type.naturalAlignment : 1

        let regions = memory.regions().filter { $0.readable && $0.writable }
        let total = max(1, regions.reduce(0) { $0 + $1.size })
        var done: UInt64 = 0
        var buffer = [UInt8](repeating: 0, count: chunkSize + width)

        for region in regions {
            var chunkStart = region.start
            while chunkStart < region.end {
                let body = Int(min(UInt64(chunkSize), region.end - chunkStart))
                // Read a little past the chunk (inside the region) so values straddling chunks are found.
                let readLength = Int(min(UInt64(body + width - 1), region.end - chunkStart))
                let ok: Bool = buffer.withUnsafeMutableBytes { raw in
                    let slice = UnsafeMutableRawBufferPointer(rebasing: raw[0..<readLength])
                    return (try? memory.read(chunkStart, into: slice)) != nil
                }
                if ok {
                    buffer.withUnsafeBytes { raw in
                        let base = raw.baseAddress!
                        let misalign = Int(chunkStart % UInt64(alignment))
                        var offset = misalign == 0 ? 0 : alignment - misalign
                        let lastStart = readLength - width
                        while offset < body && offset <= lastStart {
                            let p = base + offset
                            if matcher.matches(p, previous: nil) {
                                if results.count >= resultCap { results.truncated = true; return }
                                results.append(chunkStart + UInt64(offset), p)
                            }
                            offset += alignment
                        }
                    }
                    if results.truncated { return results }
                }
                chunkStart += UInt64(body)
                done += UInt64(body)
                if !progress(Double(done) / Double(total)) { throw ScanError.cancelled }
            }
        }
        return results
    }

    /// Re-reads every previous result and keeps those matching `condition`.
    public func nextScan(
        _ previous: ScanResults,
        condition: ScanCondition,
        progress: (Double) -> Bool = { _ in true }
    ) throws -> ScanResults {
        let type = previous.type
        let width = previous.width
        let matcher = try Matcher(type: type, condition: condition, width: width)
        var results = ScanResults(type: type, width: width)
        results.truncated = previous.truncated

        let maxBlock: UInt64 = 64 << 10
        var buffer = [UInt8](repeating: 0, count: Int(maxBlock) + width)
        var i = 0
        let n = previous.count
        try previous.values.withUnsafeBytes { prevRaw in
            while i < n {
                // Group nearby addresses into one read.
                let blockStart = previous.addresses[i]
                var j = i
                while j + 1 < n && previous.addresses[j + 1] + UInt64(width) - blockStart <= maxBlock { j += 1 }
                let blockLength = Int(previous.addresses[j] + UInt64(width) - blockStart)

                let ok: Bool = buffer.withUnsafeMutableBytes { raw in
                    let slice = UnsafeMutableRawBufferPointer(rebasing: raw[0..<blockLength])
                    return (try? memory.read(blockStart, into: slice)) != nil
                }
                if ok {
                    buffer.withUnsafeBytes { raw in
                        for k in i...j {
                            let address = previous.addresses[k]
                            let p = raw.baseAddress! + Int(address - blockStart)
                            if matcher.matches(p, previous: prevRaw.baseAddress! + k * width) {
                                results.append(address, p)
                            }
                        }
                    }
                } else {
                    // The block straddles something unmapped; fall back to per-address reads.
                    for k in i...j {
                        let address = previous.addresses[k]
                        guard let bytes = try? memory.read(address, count: width) else { continue }
                        bytes.withUnsafeBytes { raw in
                            if matcher.matches(raw.baseAddress!, previous: prevRaw.baseAddress! + k * width) {
                                results.append(address, raw.baseAddress!)
                            }
                        }
                    }
                }
                i = j + 1
                if !progress(Double(i) / Double(max(n, 1))) { throw ScanError.cancelled }
            }
        }
        return results
    }
}

/// Compiled form of a scan condition.
struct Matcher {
    let type: ValueType
    let width: Int
    private let test: (UnsafeRawPointer, UnsafeRawPointer?) -> Bool

    init(type: ValueType, condition: ScanCondition, width explicitWidth: Int? = nil) throws {
        self.type = type
        func num(_ s: String) throws -> Double {
            guard let v = type.number(try type.encode(s)) else { throw ValueError.invalid(s, type) }
            return v
        }

        if type.isText {
            guard case let .exact(text) = condition else {
                throw ScanError.unsupported("Text can only be scanned for an exact value.")
            }
            let target = try type.encode(text)
            if let w = explicitWidth, w != target.count {
                throw ScanError.unsupported("Text next-scans must have the same length as the first scan.")
            }
            width = target.count
            test = { p, _ in target.withUnsafeBytes { memcmp(p, $0.baseAddress!, target.count) == 0 } }
            return
        }

        let w = type.fixedWidth!
        width = w
        let t = type
        switch condition {
        case let .exact(text):
            if type.isFloatingPoint {
                // Game UIs round; match anything that displays as the typed number.
                let v = try num(text)
                let decimals = text.split(separator: ".").dropFirst().first?.count ?? 0
                let tolerance = 0.5 * pow(10, -Double(decimals))
                test = { p, _ in abs(t.number(at: p)! - v) <= tolerance }
            } else {
                let target = try type.encode(text)
                let first = target[0]
                test = { p, _ in
                    p.load(as: UInt8.self) == first && target.withUnsafeBytes { memcmp(p, $0.baseAddress!, w) == 0 }
                }
            }
        case let .between(a, b):
            let lo = try num(a), hi = try num(b)
            let (l, h) = lo <= hi ? (lo, hi) : (hi, lo)
            test = { p, _ in let v = t.number(at: p)!; return v >= l && v <= h }
        case .changed:
            test = { p, prev in memcmp(p, prev!, w) != 0 }
        case .unchanged:
            test = { p, prev in memcmp(p, prev!, w) == 0 }
        case .increased:
            test = { p, prev in t.number(at: p)! > t.number(at: prev!)! }
        case .decreased:
            test = { p, prev in t.number(at: p)! < t.number(at: prev!)! }
        case let .increasedBy(text):
            let d = try num(text)
            test = { p, prev in abs(t.number(at: p)! - t.number(at: prev!)! - d) < 1e-6 * max(1, abs(d)) }
        case let .decreasedBy(text):
            let d = try num(text)
            test = { p, prev in abs(t.number(at: prev!)! - t.number(at: p)! - d) < 1e-6 * max(1, abs(d)) }
        }
    }

    func matches(_ p: UnsafeRawPointer, previous: UnsafeRawPointer?) -> Bool { test(p, previous) }
}
