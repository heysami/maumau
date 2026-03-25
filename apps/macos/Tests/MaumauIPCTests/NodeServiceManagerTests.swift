import Foundation
import Testing
@testable import Maumau

@Suite(.serialized) struct NodeServiceManagerTests {
    @Test func `builds node service commands with current CLI shape`() throws {
        let tmp = try makeTempDirForTests()
        CommandResolver.setProjectRoot(tmp.path)

        let maumauPath = tmp.appendingPathComponent("node_modules/.bin/maumau")
        try makeExecutableForTests(at: maumauPath)

        let start = NodeServiceManager._testServiceCommand(["start"])
        #expect(start == [maumauPath.path, "node", "start", "--json"])

        let stop = NodeServiceManager._testServiceCommand(["stop"])
        #expect(stop == [maumauPath.path, "node", "stop", "--json"])
    }
}
