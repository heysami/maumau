import AppKit
import SwiftUI
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct SettingsViewSmokeTests {
    @Test func `cron settings builds body`() {
        let store = CronJobsStore(isPreview: true)
        store.schedulerEnabled = false
        store.schedulerStorePath = "/tmp/maumau-cron-store.json"

        let job1 = CronJob(
            id: "job-1",
            agentId: "ops",
            name: "  Morning Check-in  ",
            description: nil,
            enabled: true,
            deleteAfterRun: nil,
            createdAtMs: 1_700_000_000_000,
            updatedAtMs: 1_700_000_100_000,
            schedule: .cron(expr: "0 8 * * *", tz: "UTC"),
            sessionTarget: .main,
            wakeMode: .now,
            payload: .systemEvent(text: "ping"),
            delivery: nil,
            state: CronJobState(
                nextRunAtMs: 1_700_000_200_000,
                runningAtMs: nil,
                lastRunAtMs: 1_700_000_050_000,
                lastStatus: "ok",
                lastError: nil,
                lastDurationMs: 123))

        let job2 = CronJob(
            id: "job-2",
            agentId: nil,
            name: "",
            description: nil,
            enabled: false,
            deleteAfterRun: nil,
            createdAtMs: 1_700_000_000_000,
            updatedAtMs: 1_700_000_100_000,
            schedule: .every(everyMs: 30000, anchorMs: nil),
            sessionTarget: .isolated,
            wakeMode: .nextHeartbeat,
            payload: .agentTurn(
                message: "hello",
                thinking: "low",
                timeoutSeconds: 30,
                deliver: nil,
                channel: nil,
                to: nil,
                bestEffortDeliver: nil),
            delivery: CronDelivery(mode: .announce, channel: "sms", to: "+15551234567", bestEffort: true),
            state: CronJobState(
                nextRunAtMs: nil,
                runningAtMs: nil,
                lastRunAtMs: nil,
                lastStatus: nil,
                lastError: nil,
                lastDurationMs: nil))

        store.jobs = [job1, job2]
        store.selectedJobId = job1.id
        store.runEntries = [
            CronRunLogEntry(
                ts: 1_700_000_050_000,
                jobId: job1.id,
                action: "finished",
                status: "ok",
                error: nil,
                summary: "ok",
                runAtMs: 1_700_000_050_000,
                durationMs: 123,
                nextRunAtMs: 1_700_000_200_000),
        ]

        let view = CronSettings(store: store)
        _ = view.body
    }

    @Test func `cron settings fitting size stays bounded`() {
        let store = CronJobsStore(isPreview: true)
        store.jobs = (0..<40).map { index in
            CronJob(
                id: "job-\(index)",
                agentId: "ops",
                name: "Window smoke \(index)",
                description: nil,
                enabled: true,
                deleteAfterRun: nil,
                createdAtMs: 1_700_000_000_000,
                updatedAtMs: 1_700_000_100_000,
                schedule: .every(everyMs: 30_000, anchorMs: nil),
                sessionTarget: .isolated,
                wakeMode: .now,
                payload: .systemEvent(text: "ping"),
                delivery: nil,
                state: CronJobState())
        }
        store.selectedJobId = "job-1"

        let hosting = NSHostingView(
            rootView: CronSettings(store: store, channelsStore: ChannelsStore(isPreview: true)))
        let size = hosting.fittingSize
        #expect(size.height <= SettingsTab.windowHeight + 1)
    }

    @Test func `cron settings exercises private views`() {
        CronSettings.exerciseForTesting()
    }

    @Test func `cron settings mounts in window`() {
        let store = CronJobsStore(isPreview: true)
        store.jobs = [
            CronJob(
                id: "job-1",
                agentId: "ops",
                name: "Window smoke",
                description: nil,
                enabled: true,
                deleteAfterRun: nil,
                createdAtMs: 1_700_000_000_000,
                updatedAtMs: 1_700_000_100_000,
                schedule: .every(everyMs: 30_000, anchorMs: nil),
                sessionTarget: .isolated,
                wakeMode: .now,
                payload: .systemEvent(text: "ping"),
                delivery: nil,
                state: CronJobState())
        ]
        store.selectedJobId = "job-1"

        let controller = NSHostingController(
            rootView: CronSettings(store: store, channelsStore: ChannelsStore(isPreview: true)))
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()
        #expect(window.contentViewController === controller)
    }

    @Test func `config settings builds body`() {
        let view = ConfigSettings()
        _ = view.body
    }

    @Test func `models settings builds body`() {
        let view = ModelsSettings()
        _ = view.body
    }

    @Test func `models settings mounts in window`() {
        let controller = NSHostingController(rootView: ModelsSettings())
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()
        #expect(window.contentViewController === controller)
    }

    @Test func `model provider connect sheet mounts in window`() {
        let controller = NSHostingController(rootView: ModelProviderConnectSheetHarness())
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()
        #expect(window.contentViewController === controller)
    }

    @Test func `debug settings builds body`() {
        let view = DebugSettings()
        _ = view.body
    }

    @Test func `general settings builds body`() {
        let state = AppState(preview: true)
        let view = GeneralSettings(state: state)
        _ = view.body
    }

    @Test func `general settings exercises branches`() {
        GeneralSettings.exerciseForTesting()
    }

    @Test func `sessions settings builds body`() {
        let view = SessionsSettings(rows: SessionRow.previewRows, isPreview: true)
        _ = view.body
    }

    @Test func `sessions settings fitting size stays bounded`() {
        let rows = (0..<60).map { index in
            SessionRow(
                id: "preview-\(index)",
                key: "user-\(index)@example.com",
                kind: index.isMultiple(of: 3) ? .group : .direct,
                displayName: index.isMultiple(of: 3) ? "discord:#room-\(index)" : nil,
                provider: index.isMultiple(of: 3) ? "discord" : nil,
                subject: nil,
                room: index.isMultiple(of: 3) ? "#room-\(index)" : nil,
                space: nil,
                updatedAt: Date().addingTimeInterval(Double(-index * 120)),
                sessionId: "sess-\(index)",
                thinkingLevel: index.isMultiple(of: 2) ? "low" : "medium",
                verboseLevel: index.isMultiple(of: 5) ? "info" : nil,
                systemSent: index.isMultiple(of: 4),
                abortedLastRun: index.isMultiple(of: 7),
                tokens: SessionTokenStats(
                    input: 200 + index,
                    output: 400 + index,
                    total: 600 + index,
                    contextTokens: 200_000),
                model: "gpt-5.4")
        }
        let hosting = NSHostingView(rootView: SessionsSettings(rows: rows, isPreview: true))
        let size = hosting.fittingSize
        #expect(size.height <= SettingsTab.windowHeight + 1)
    }

    @Test func `instances settings builds body`() {
        let store = InstancesStore(isPreview: true)
        store.instances = [
            InstanceInfo(
                id: "local",
                host: "this-mac",
                ip: "127.0.0.1",
                version: "1.0",
                platform: "macos 15.0",
                deviceFamily: "Mac",
                modelIdentifier: "MacPreview",
                lastInputSeconds: 12,
                mode: "local",
                reason: "test",
                text: "test instance",
                ts: Date().timeIntervalSince1970 * 1000),
        ]
        let view = InstancesSettings(store: store)
        _ = view.body
    }

    @Test func `permissions settings builds body`() {
        let view = PermissionsSettings(
            status: [
                .notifications: true,
                .screenRecording: false,
            ],
            refresh: {},
            showOnboarding: {})
        _ = view.body
    }

    @Test func `settings root view builds body`() {
        let state = AppState(preview: true)
        let view = SettingsRootView(state: state, updater: nil, initialTab: .general)
        _ = view.body
    }

    @Test func `settings root mounts in window`() {
        let state = AppState(preview: true)
        let controller = NSHostingController(rootView: SettingsRootView(state: state, updater: nil, initialTab: .general))
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()
        #expect(window.contentViewController === controller)
    }

    @Test func `settings root mounts cron tab in window`() {
        let state = AppState(preview: true)
        let controller = NSHostingController(rootView: SettingsRootView(state: state, updater: nil, initialTab: .cron))
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()
        #expect(window.contentViewController === controller)
    }

    @Test func `settings root mounts models tab in window`() {
        let state = AppState(preview: true)
        let controller = NSHostingController(rootView: SettingsRootView(state: state, updater: nil, initialTab: .models))
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()
        #expect(window.contentViewController === controller)
    }

    @Test func `settings root clamps oversized window frame`() async {
        let state = AppState(preview: true)
        let controller = NSHostingController(rootView: SettingsRootView(state: state, updater: nil, initialTab: .general))
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()

        guard let visibleFrame = (window.screen ?? NSScreen.main ?? NSScreen.screens.first)?.visibleFrame,
              visibleFrame != .zero
        else { return }

        window.setFrame(
            NSRect(
                x: visibleFrame.minX,
                y: visibleFrame.minY,
                width: SettingsTab.windowWidth,
                height: visibleFrame.height + 200),
            display: false)
        NotificationCenter.default.post(name: NSWindow.didResizeNotification, object: window)
        try? await Task.sleep(for: .milliseconds(100))

        #expect(window.frame.height <= visibleFrame.height)

        NotificationCenter.default.post(name: .maumauSelectSettingsTab, object: SettingsTab.sessions)
        try? await Task.sleep(for: .milliseconds(100))

        window.setFrame(
            NSRect(
                x: visibleFrame.minX,
                y: visibleFrame.minY,
                width: SettingsTab.windowWidth,
                height: visibleFrame.height + 160),
            display: false)
        NotificationCenter.default.post(name: NSWindow.didResizeNotification, object: window)
        try? await Task.sleep(for: .milliseconds(100))

        #expect(window.frame.height <= visibleFrame.height)

        NotificationCenter.default.post(name: .maumauSelectSettingsTab, object: SettingsTab.cron)
        try? await Task.sleep(for: .milliseconds(100))

        window.setFrame(
            NSRect(
                x: visibleFrame.minX,
                y: visibleFrame.minY,
                width: SettingsTab.windowWidth,
                height: visibleFrame.height + 160),
            display: false)
        NotificationCenter.default.post(name: NSWindow.didResizeNotification, object: window)
        try? await Task.sleep(for: .milliseconds(100))

        #expect(window.frame.height <= visibleFrame.height)
    }

    @Test func `settings window sizing caps scene constraints to the visible screen`() {
        let contentRect = NSRect(x: 0, y: 0, width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
        let window = NSWindow(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false)
        let simulatedVisibleFrame = NSRect(x: 20, y: 30, width: 780, height: 620)

        window.contentMinSize = contentRect.size
        window.minSize = window.frameRect(forContentRect: contentRect).size
        window.contentMaxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        window.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        window.setFrame(
            NSRect(
                x: simulatedVisibleFrame.minX,
                y: simulatedVisibleFrame.minY,
                width: contentRect.width,
                height: simulatedVisibleFrame.height + 180),
            display: false)

        let constraints = SettingsWindowSizing.Constraints(window: window)
        SettingsWindowSizing.apply(to: window, baseConstraints: constraints, visibleFrame: simulatedVisibleFrame)

        #expect(window.frame.height <= simulatedVisibleFrame.height)
        #expect(window.maxSize.height <= simulatedVisibleFrame.height)
        #expect(window.minSize.height <= simulatedVisibleFrame.height)
        #expect(
            window.contentMaxSize.height ==
                SettingsWindowSizing.maxContentHeight(within: simulatedVisibleFrame))
        #expect(window.contentMinSize.height <= window.contentMaxSize.height)
    }

    @Test func `settings window sizing separates frame and content heights`() {
        let shortVisibleFrame = NSRect(x: 0, y: 0, width: 900, height: 620)
        let tallVisibleFrame = NSRect(x: 0, y: 0, width: 900, height: 1200)

        #expect(SettingsWindowSizing.defaultFrameHeight(visibleFrame: shortVisibleFrame) == 620)
        #expect(
            SettingsWindowSizing.defaultContentHeight(visibleFrame: shortVisibleFrame) ==
                SettingsWindowSizing.maxContentHeight(within: shortVisibleFrame))
        #expect(
            SettingsWindowSizing.defaultContentHeight(visibleFrame: shortVisibleFrame) <
                SettingsWindowSizing.defaultFrameHeight(visibleFrame: shortVisibleFrame))

        #expect(SettingsWindowSizing.defaultFrameHeight(visibleFrame: tallVisibleFrame) == SettingsTab.windowHeight)
        #expect(
            SettingsWindowSizing.defaultContentHeight(visibleFrame: tallVisibleFrame) ==
                SettingsWindowSizing.desiredContentHeight)
    }

    @Test func `settings window sizing preserves top edge when shrinking`() {
        let contentRect = NSRect(x: 0, y: 0, width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
        let window = NSWindow(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false)
        let simulatedVisibleFrame = NSRect(x: 20, y: 30, width: 900, height: 620)

        window.contentMinSize = contentRect.size
        window.minSize = window.frameRect(forContentRect: contentRect).size
        window.contentMaxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        window.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        window.setFrame(
            NSRect(
                x: simulatedVisibleFrame.minX,
                y: simulatedVisibleFrame.minY,
                width: contentRect.width,
                height: simulatedVisibleFrame.height),
            display: false)

        let originalMaxY = window.frame.maxY
        let constraints = SettingsWindowSizing.Constraints(window: window)
        SettingsWindowSizing.apply(to: window, baseConstraints: constraints, visibleFrame: simulatedVisibleFrame)

        #expect(abs(window.frame.maxY - originalMaxY) <= 1)
        #expect(window.frame.height < simulatedVisibleFrame.height)
    }

    @Test func `settings root fitting size stays bounded for all tabs`() {
        for tab in SettingsTab.allCases {
            let state = AppState(preview: true)
            state.debugPaneEnabled = true
            let view = SettingsRootView(state: state, updater: nil, initialTab: tab)
            let hosting = NSHostingView(rootView: view)
            let size = hosting.fittingSize
            #expect(size.height <= SettingsTab.windowHeight + 1)
        }
    }

    @Test func `about settings builds body`() {
        let view = AboutSettings(updater: nil)
        _ = view.body
    }

    @Test func `voice wake settings builds body`() {
        let state = AppState(preview: true)
        let view = VoiceWakeSettings(state: state, isActive: false)
        _ = view.body
    }

    @Test func `settings root mounts with indonesian locale selected`() {
        let state = AppState(preview: true)
        state.onboardingLanguage = .id
        let controller = NSHostingController(rootView: SettingsRootView(state: state, updater: nil, initialTab: .voiceWake))
        let window = NSWindow(contentViewController: controller)
        window.contentView?.layoutSubtreeIfNeeded()
        #expect(window.contentViewController === controller)
    }

    @Test func `skills settings builds body`() {
        let view = SkillsSettings(state: .preview)
        _ = view.body
    }

    @Test func `plugins settings builds body`() {
        let view = PluginsSettings(model: PluginsSettingsModel.previewModel())
        _ = view.body
    }
}

private struct ModelProviderConnectSheetHarness: View {
    @State private var selectedGroupId = "openai"
    @State private var selectedChoiceId = "openai-codex"
    @State private var wizard = OnboardingWizardModel()

    var body: some View {
        ModelProviderConnectSheet(
            wizard: self.wizard,
            language: .en,
            groups: [
                ModelAuthChoiceGroup(
                    id: "openai",
                    label: "OpenAI",
                    hint: "ChatGPT sign-in or API key",
                    options: [
                        ModelAuthChoiceOption(
                            id: "openai-codex",
                            label: "OpenAI Codex (ChatGPT OAuth)",
                            hint: "Browser sign-in",
                            providerId: "openai-codex"),
                        ModelAuthChoiceOption(
                            id: "openai-api-key",
                            label: "OpenAI API key",
                            hint: nil,
                            providerId: "openai"),
                    ]),
            ],
            connectedProviderIds: ["openai-codex"],
            isLoadingChoices: false,
            choicesError: nil,
            selectedGroupId: self.$selectedGroupId,
            selectedChoiceId: self.$selectedChoiceId,
            retryChoices: {},
            startSelectedChoice: {},
            cancel: {})
    }
}
