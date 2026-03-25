import CoreLocation
import Foundation
import MaumauKit
import UIKit

typealias MaumauCameraSnapResult = (format: String, base64: String, width: Int, height: Int)
typealias MaumauCameraClipResult = (format: String, base64: String, durationMs: Int, hasAudio: Bool)

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: MaumauCameraSnapParams) async throws -> MaumauCameraSnapResult
    func clip(params: MaumauCameraClipParams) async throws -> MaumauCameraClipResult
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: MaumauLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: MaumauLocationGetParams,
        desiredAccuracy: MaumauLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
    func startLocationUpdates(
        desiredAccuracy: MaumauLocationAccuracy,
        significantChangesOnly: Bool) -> AsyncStream<CLLocation>
    func stopLocationUpdates()
    func startMonitoringSignificantLocationChanges(onUpdate: @escaping @Sendable (CLLocation) -> Void)
    func stopMonitoringSignificantLocationChanges()
}

@MainActor
protocol DeviceStatusServicing: Sendable {
    func status() async throws -> MaumauDeviceStatusPayload
    func info() -> MaumauDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: MaumauPhotosLatestParams) async throws -> MaumauPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: MaumauContactsSearchParams) async throws -> MaumauContactsSearchPayload
    func add(params: MaumauContactsAddParams) async throws -> MaumauContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: MaumauCalendarEventsParams) async throws -> MaumauCalendarEventsPayload
    func add(params: MaumauCalendarAddParams) async throws -> MaumauCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: MaumauRemindersListParams) async throws -> MaumauRemindersListPayload
    func add(params: MaumauRemindersAddParams) async throws -> MaumauRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: MaumauMotionActivityParams) async throws -> MaumauMotionActivityPayload
    func pedometer(params: MaumauPedometerParams) async throws -> MaumauPedometerPayload
}

struct WatchMessagingStatus: Sendable, Equatable {
    var supported: Bool
    var paired: Bool
    var appInstalled: Bool
    var reachable: Bool
    var activationState: String
}

struct WatchQuickReplyEvent: Sendable, Equatable {
    var replyId: String
    var promptId: String
    var actionId: String
    var actionLabel: String?
    var sessionKey: String?
    var note: String?
    var sentAtMs: Int?
    var transport: String
}

struct WatchNotificationSendResult: Sendable, Equatable {
    var deliveredImmediately: Bool
    var queuedForDelivery: Bool
    var transport: String
}

protocol WatchMessagingServicing: AnyObject, Sendable {
    func status() async -> WatchMessagingStatus
    func setReplyHandler(_ handler: (@Sendable (WatchQuickReplyEvent) -> Void)?)
    func sendNotification(
        id: String,
        params: MaumauWatchNotifyParams) async throws -> WatchNotificationSendResult
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
