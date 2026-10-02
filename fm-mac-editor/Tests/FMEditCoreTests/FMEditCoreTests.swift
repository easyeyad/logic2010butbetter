import XCTest
@testable import FMEditCore

/// In-memory stand-in for a game process.
final class FakeMemory: MemoryAccess {
    var sessionID: Int32 = 42
    var isAlive = true
    var blocks: [(start: UInt64, bytes: [UInt8], writable: Bool)] = []
    var corruptWrites = false

    func regions() -> [MemoryRegion] {
        blocks.map { MemoryRegion(start: $0.start, size: UInt64($0.bytes.count), writable: $0.writable) }
    }

    private func locate(_ address: UInt64, _ count: Int) -> (Int, Int)? {
        for (i, b) in blocks.enumerated() where address >= b.start && address + UInt64(count) <= b.start + UInt64(b.bytes.count) {
            return (i, Int(address - b.start))
        }
        return nil
    }

    func read(_ address: UInt64, into buffer: UnsafeMutableRawBufferPointer) throws {
        guard let (i, off) = locate(address, buffer.count) else { throw MemoryError.unreadable(address) }
        blocks[i].bytes.withUnsafeBytes { src in
            buffer.copyMemory(from: UnsafeRawBufferPointer(rebasing: src[off..<(off + buffer.count)]))
        }
    }

    func write(_ address: UInt64, bytes: [UInt8]) throws {
        guard let (i, off) = locate(address, bytes.count) else { throw MemoryError.unwritable(address) }
        let data = corruptWrites ? bytes.map { $0 ^ 0xFF } : bytes
        blocks[i].bytes.replaceSubrange(off..<(off + bytes.count), with: data)
    }

    func put<T: FixedWidthInteger>(_ value: T, at address: UInt64) {
        try! write(address, bytes: withUnsafeBytes(of: value.littleEndian) { Array($0) })
    }
}

final class ValueTypeTests: XCTestCase {
    func testIntegerRoundTrip() throws {
        XCTAssertEqual(try ValueType.int32.encode("1,500,000"), [0x60, 0xE3, 0x16, 0x00])
        XCTAssertEqual(ValueType.int32.format([0x60, 0xE3, 0x16, 0x00]), "1500000")
        XCTAssertEqual(try ValueType.int16.encode("-2"), [0xFE, 0xFF])
        XCTAssertEqual(try ValueType.uint8.encode("0xFF"), [0xFF])
        XCTAssertThrowsError(try ValueType.int8.encode("200"))
        XCTAssertThrowsError(try ValueType.int32.encode("abc"))
    }

    func testFloatAndText() throws {
        XCTAssertEqual(ValueType.float.number(try ValueType.float.encode("2.5")), 2.5)
        XCTAssertEqual(try ValueType.utf16.encode("Ab"), [0x41, 0, 0x62, 0])
        XCTAssertEqual(ValueType.utf16.format([0x41, 0, 0x62, 0]), "Ab")
    }

    func testAddressParsing() {
        XCTAssertEqual(parseAddress("0x1F_00"), 0x1F00)
        XCTAssertEqual(parseAddress("abc"), 0xABC)
        XCTAssertNil(parseAddress("zz"))
    }
}

final class ScannerTests: XCTestCase {
    func makeMemory() -> FakeMemory {
        let m = FakeMemory()
        m.blocks = [
            (0x1000, [UInt8](repeating: 0, count: 64), true),
            (0x9000, [UInt8](repeating: 0, count: 64), false), // read-only: never scanned
            (0x20000, [UInt8](repeating: 0, count: 64), true),
        ]
        m.put(Int32(150), at: 0x1008)
        m.put(Int32(150), at: 0x9000)
        m.put(Int32(150), at: 0x20010)
        m.put(Int32(77), at: 0x20020)
        return m
    }

    func testFirstScanExactAndNextScan() throws {
        let m = makeMemory()
        let s = Scanner(memory: m)
        var r = try s.firstScan(type: .int32, condition: .exact("150"))
        XCTAssertEqual(r.addresses, [0x1008, 0x20010])

        m.put(Int32(160), at: 0x20010)
        r = try s.nextScan(r, condition: .increased)
        XCTAssertEqual(r.addresses, [0x20010])
        XCTAssertEqual(ValueType.int32.format(r.value(at: 0)), "160")

        r = try s.nextScan(r, condition: .unchanged)
        XCTAssertEqual(r.addresses, [0x20010])
        m.put(Int32(150), at: 0x20010)
        r = try s.nextScan(r, condition: .decreasedBy("10"))
        XCTAssertEqual(r.addresses, [0x20010])
    }

    func testValuesStraddlingChunksAreFound() throws {
        let m = FakeMemory()
        m.blocks = [(0x1000, [UInt8](repeating: 0, count: 32), true)]
        m.put(Int32(0x01020304), at: 0x1006) // crosses the 8-byte chunk boundary at 0x1008
        let s = Scanner(memory: m)
        s.chunkSize = 8
        let r = try s.firstScan(type: .int32, condition: .exact("16909060"), aligned: false)
        XCTAssertEqual(r.addresses, [0x1006])
    }

    func testBetweenAndUnreadableNextScan() throws {
        let m = makeMemory()
        let s = Scanner(memory: m)
        var r = try s.firstScan(type: .int32, condition: .between("70", "80"))
        XCTAssertEqual(r.addresses, [0x20020])
        m.blocks.removeLast() // region unmapped
        r = try s.nextScan(r, condition: .unchanged)
        XCTAssertEqual(r.count, 0)
    }

    func testTextScanAndRules() throws {
        let m = makeMemory()
        try m.write(0x1020, bytes: try ValueType.utf16.encode("Kai"))
        let s = Scanner(memory: m)
        let r = try s.firstScan(type: .utf16, condition: .exact("Kai"))
        XCTAssertEqual(r.addresses, [0x1020])
        XCTAssertThrowsError(try s.firstScan(type: .int32, condition: .changed))
        XCTAssertThrowsError(try s.nextScan(r, condition: .increased))
    }

    func testCancel() {
        let s = Scanner(memory: makeMemory())
        XCTAssertThrowsError(try s.firstScan(type: .int32, condition: .exact("1"), progress: { _ in false })) {
            XCTAssertEqual($0 as? ScanError, .cancelled)
        }
    }
}

final class EditEngineTests: XCTestCase {
    func testPreviewCommitUndo() throws {
        let m = FakeMemory()
        m.blocks = [(0x1000, [UInt8](repeating: 0, count: 16), true)]
        m.put(Int16(120), at: 0x1004)
        let e = EditEngine(memory: m)

        let p = try e.preview(label: "CA", address: 0x1004, type: .int16, newValue: "180")
        XCTAssertEqual(p.oldText, "120")
        XCTAssertEqual(ValueType.int16.format(try m.read(0x1004, count: 2)), "120", "preview must not write")

        let entry = try e.commit(p)
        XCTAssertEqual(ValueType.int16.format(try m.read(0x1004, count: 2)), "180")
        try e.undo(entry.id)
        XCTAssertEqual(ValueType.int16.format(try m.read(0x1004, count: 2)), "120")
        XCTAssertThrowsError(try e.undo(entry.id)) { XCTAssertEqual($0 as? EditError, .alreadyUndone) }
    }

    func testCompareAndSwapRejectsStaleValues() throws {
        let m = FakeMemory()
        m.blocks = [(0x1000, [UInt8](repeating: 0, count: 16), true)]
        m.put(Int32(5), at: 0x1000)
        let e = EditEngine(memory: m)

        let p = try e.preview(label: "x", address: 0x1000, type: .int32, newValue: "9")
        m.put(Int32(6), at: 0x1000) // game changed it meanwhile
        XCTAssertThrowsError(try e.commit(p)) { guard case .stale = $0 as? EditError else { return XCTFail() } }
        XCTAssertEqual(ValueType.int32.format(try m.read(0x1000, count: 4)), "6")

        let p2 = try e.preview(label: "x", address: 0x1000, type: .int32, newValue: "9")
        let entry = try e.commit(p2)
        m.put(Int32(10), at: 0x1000) // game changed it after our write
        XCTAssertThrowsError(try e.undo(entry.id)) { guard case .stale = $0 as? EditError else { return XCTFail() } }
        XCTAssertEqual(ValueType.int32.format(try m.read(0x1000, count: 4)), "10")
    }

    func testReadBackFailureRestoresAndSessionGuard() throws {
        let m = FakeMemory()
        m.blocks = [(0x1000, [UInt8](repeating: 7, count: 16), true)]
        let e = EditEngine(memory: m)
        let p = try e.preview(label: "x", address: 0x1000, type: .uint8, newValue: "9")
        m.corruptWrites = true
        XCTAssertThrowsError(try e.commit(p)) { guard case .readBackMismatch = $0 as? EditError else { return XCTFail() } }
        XCTAssertTrue(e.journal.isEmpty)

        m.corruptWrites = false
        m.sessionID = 99
        XCTAssertThrowsError(try e.commit(p)) { XCTAssertEqual($0 as? EditError, .sessionChanged) }
    }

    func testTextEditsMustFit() throws {
        let m = FakeMemory()
        m.blocks = [(0x1000, Array("Smith".utf8) + [0, 0, 0], true)]
        let e = EditEngine(memory: m)
        XCTAssertThrowsError(try e.preview(label: "n", address: 0x1000, type: .utf8, newValue: "Johnson", textLength: 5))
        let p = try e.preview(label: "n", address: 0x1000, type: .utf8, newValue: "Li", textLength: 5)
        try e.commit(p)
        XCTAssertEqual(try m.read(0x1000, count: 5), Array("Li".utf8) + [0, 0, 0])
    }
}

final class SavedTableTests: XCTestCase {
    func testGroupsFollowTheirBase() throws {
        var t = SavedTable()
        let g = SavedGroup(name: "Player")
        t.groups.append(g)
        t.add(label: "CA", type: .int16, address: 0x5000, textLength: nil, groupID: g.id, session: 1)
        t.add(label: "PA", type: .int16, address: 0x5002, textLength: nil, groupID: g.id, session: 1)
        XCTAssertEqual(t.entries[1].offset, 2)
        XCTAssertEqual(t.address(of: t.entries[1], session: 1), 0x5002)
        XCTAssertNil(t.address(of: t.entries[1], session: 2), "base is per session")

        // New session: re-find CA and the whole group relocates.
        t.anchor(groupID: g.id, entry: t.entries[0], at: 0x9000, session: 2)
        XCTAssertEqual(t.address(of: t.entries[1], session: 2), 0x9002)
    }

    func testLooseEntriesResetPerSessionAndPersist() throws {
        var t = SavedTable()
        t.add(label: "Balance", type: .int64, address: 0x100, textLength: nil, groupID: nil, session: 1)
        XCTAssertEqual(t.address(of: t.entries[0], session: 1), 0x100)
        t.add(label: "Budget", type: .int64, address: 0x200, textLength: nil, groupID: nil, session: 2)
        XCTAssertEqual(t.entries.map(\.label), ["Budget"])

        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "/table.json")
        try t.save(to: url)
        XCTAssertEqual(SavedTable.load(from: url), t)
    }
}
