#if os(macOS)
import Darwin
import Foundation

public enum MachAttachError: Error, LocalizedError {
    case taskForPid(pid: Int32, code: kern_return_t)

    public var errorDescription: String? {
        switch self {
        case let .taskForPid(pid, code):
            let message = String(cString: mach_error_string(code))
            return """
            macOS refused access to process \(pid) (\(message), code \(code)).
            Run ./scripts/prepare-game.sh once (after each game update), then start the editor with ./scripts/run.sh.
            """
        }
    }
}

/// Reads and writes another process's memory through its Mach task port.
public final class MachMemory: MemoryAccess, @unchecked Sendable {
    public let pid: Int32
    private let task: mach_port_t

    // vm_prot_t bits (the C macros use casts, which Swift doesn't import).
    private let protRead: vm_prot_t = 0x01
    private let protWrite: vm_prot_t = 0x02
    private let protCopy: vm_prot_t = 0x10

    public init(pid: Int32) throws {
        var port: mach_port_t = 0
        let kr = task_for_pid(mach_task_self_, pid, &port)
        guard kr == KERN_SUCCESS else { throw MachAttachError.taskForPid(pid: pid, code: kr) }
        self.pid = pid
        self.task = port
    }

    deinit {
        mach_port_deallocate(mach_task_self_, task)
    }

    public var sessionID: Int32 { pid }

    public var isAlive: Bool {
        kill(pid, 0) == 0 || errno == EPERM
    }

    public func regions() -> [MemoryRegion] {
        var result: [MemoryRegion] = []
        var address: mach_vm_address_t = 0
        while true {
            var size: mach_vm_size_t = 0
            var info = vm_region_basic_info_data_64_t()
            var count = mach_msg_type_number_t(MemoryLayout<vm_region_basic_info_data_64_t>.size / MemoryLayout<Int32>.size)
            var objectName: mach_port_t = 0
            let kr = withUnsafeMutablePointer(to: &info) { infoPtr in
                infoPtr.withMemoryRebound(to: Int32.self, capacity: Int(count)) { intPtr in
                    mach_vm_region(task, &address, &size, VM_REGION_BASIC_INFO_64, intPtr, &count, &objectName)
                }
            }
            guard kr == KERN_SUCCESS else { break }
            // Skip the shared system library cache: it's huge and never holds game data.
            if info.shared == 0 {
                result.append(MemoryRegion(
                    start: address,
                    size: size,
                    readable: info.protection & protRead != 0,
                    writable: info.protection & protWrite != 0
                ))
            }
            address += size
        }
        return result
    }

    public func read(_ address: UInt64, into buffer: UnsafeMutableRawBufferPointer) throws {
        guard let base = buffer.baseAddress, buffer.count > 0 else { return }
        var outSize: mach_vm_size_t = 0
        let kr = mach_vm_read_overwrite(
            task, address, mach_vm_size_t(buffer.count),
            mach_vm_address_t(UInt(bitPattern: base)), &outSize
        )
        guard kr == KERN_SUCCESS, outSize == mach_vm_size_t(buffer.count) else { throw MemoryError.unreadable(address) }
    }

    public func write(_ address: UInt64, bytes: [UInt8]) throws {
        guard !bytes.isEmpty else { return }
        func attempt() -> kern_return_t {
            bytes.withUnsafeBytes { raw in
                mach_vm_write(task, address, vm_offset_t(UInt(bitPattern: raw.baseAddress)), mach_msg_type_number_t(raw.count))
            }
        }
        var kr = attempt()
        if kr == KERN_PROTECTION_FAILURE || kr == KERN_INVALID_ADDRESS {
            // Page is read-only: make a private writable copy and retry.
            _ = mach_vm_protect(task, address, mach_vm_size_t(bytes.count), 0, protRead | protWrite | protCopy)
            kr = attempt()
        }
        guard kr == KERN_SUCCESS else { throw MemoryError.unwritable(address) }
    }
}
#endif
