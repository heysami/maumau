import Observation
import MaumauProtocol
import SwiftUI

struct CronJobEditor: View {
    static let minimumContentHeight: CGFloat = 480
    static let idealContentHeightTarget: CGFloat = 640

    let job: CronJob?
    @Binding var isSaving: Bool
    @Binding var error: String?
    @Bindable var channelsStore: ChannelsStore
    let onCancel: () -> Void
    let onSave: ([String: AnyCodable]) -> Void

    let labelColumnWidth: CGFloat = 160

    static func maxContentHeight(visibleFrame: NSRect? = nil) -> CGFloat {
        SettingsWindowSizing.defaultContentHeight(visibleFrame: visibleFrame)
    }

    static func minContentHeight(visibleFrame: NSRect? = nil) -> CGFloat {
        min(self.minimumContentHeight, self.maxContentHeight(visibleFrame: visibleFrame))
    }

    static func idealContentHeight(visibleFrame: NSRect? = nil) -> CGFloat {
        min(self.idealContentHeightTarget, self.maxContentHeight(visibleFrame: visibleFrame))
    }

    @State var name: String = ""
    @State var description: String = ""
    @State var agentId: String = ""
    @State var enabled: Bool = true
    @State var sessionTarget: CronSessionTarget = .main
    @State var preservedSessionTargetRaw: String?
    @State var wakeMode: CronWakeMode = .now
    @State var deleteAfterRun: Bool = false

    enum ScheduleKind: String, CaseIterable, Identifiable { case at, every, cron; var id: String {
        rawValue
    } }
    @State var scheduleKind: ScheduleKind = .every
    @State var atDate: Date = .init().addingTimeInterval(60 * 5)
    @State var everyText: String = "1h"
    @State var cronExpr: String = "0 9 * * 3"
    @State var cronTz: String = ""

    enum PayloadKind: String, CaseIterable, Identifiable { case systemEvent, agentTurn; var id: String {
        rawValue
    } }
    @State var payloadKind: PayloadKind = .systemEvent
    @State var systemEventText: String = ""
    @State var agentMessage: String = ""
    enum DeliveryChoice: String, CaseIterable, Identifiable { case announce, none; var id: String {
        rawValue
    } }
    @State var deliveryMode: DeliveryChoice = .announce
    @State var channel: String = "last"
    @State var to: String = ""
    @State var thinking: String = ""
    @State var timeoutSeconds: String = ""
    @State var bestEffortDeliver: Bool = false

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    private func loc(_ english: String) -> String {
        macLocalized(english, language: self.language)
    }

    private var introText: String {
        self.loc(
            "Create a schedule that wakes Maumau via the Gateway. Use an isolated session for agent turns so your main chat stays clean.")
    }

    private var sessionTargetNote: String {
        self.loc(
            "Main jobs post a system event into the current main session. Current and isolated-style jobs run agent turns and can announce results to a channel.")
    }

    private var scheduleKindNote: String {
        self.loc("“At” runs once, “Every” repeats with a duration, “Cron” uses a 5-field Unix expression.")
    }

    private var isolatedPayloadNote: String {
        self.loc("Isolated jobs always run an agent turn. Announce sends a short summary to a channel.")
    }

    private var mainPayloadNote: String {
        self.loc("System events are injected into the current main session. Agent turns require an isolated session target.")
    }

    var channelOptions: [String] {
        let ordered = self.channelsStore.orderedChannelIds()
        var options = ["last"] + ordered
        let trimmed = self.channel.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty, !options.contains(trimmed) {
            options.append(trimmed)
        }
        var seen = Set<String>()
        return options.filter { seen.insert($0).inserted }
    }

    func channelLabel(for id: String) -> String {
        if id == "last" { return self.loc("last") }
        return self.channelsStore.resolveChannelLabel(id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(self.job == nil ? self.loc("New cron job") : self.loc("Edit cron job"))
                    .font(.title3.weight(.semibold))
                Text(self.introText)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 14) {
                    GroupBox(self.loc("Basics")) {
                        Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 14, verticalSpacing: 10) {
                            GridRow {
                                self.gridLabel(self.loc("Name"))
                                TextField(self.loc("Required (e.g. “Daily summary”)"), text: self.$name)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(maxWidth: .infinity)
                            }
                            GridRow {
                                self.gridLabel(self.loc("Description"))
                                TextField(self.loc("Optional notes"), text: self.$description)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(maxWidth: .infinity)
                            }
                            GridRow {
                                self.gridLabel(self.loc("Agent ID"))
                                TextField(self.loc("Optional (default agent)"), text: self.$agentId)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(maxWidth: .infinity)
                            }
                            GridRow {
                                self.gridLabel(self.loc("Enabled"))
                                Toggle("", isOn: self.$enabled)
                                    .labelsHidden()
                                    .toggleStyle(.switch)
                            }
                            GridRow {
                                self.gridLabel(self.loc("Session target"))
                                Picker("", selection: self.$sessionTarget) {
                                    Text(self.loc("main")).tag(CronSessionTarget.main)
                                    Text(self.loc("isolated")).tag(CronSessionTarget.isolated)
                                    Text(self.loc("current")).tag(CronSessionTarget.current)
                                }
                                .labelsHidden()
                                .pickerStyle(.segmented)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            GridRow {
                                self.gridLabel(self.loc("Wake mode"))
                                Picker("", selection: self.$wakeMode) {
                                    Text(self.loc("now")).tag(CronWakeMode.now)
                                    Text(self.loc("next-heartbeat")).tag(CronWakeMode.nextHeartbeat)
                                }
                                .labelsHidden()
                                .pickerStyle(.segmented)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            GridRow {
                                Color.clear
                                    .frame(width: self.labelColumnWidth, height: 1)
                                Text(
                                    self.sessionTargetNote)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }

                    GroupBox(self.loc("Schedule")) {
                        Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 14, verticalSpacing: 10) {
                            GridRow {
                                self.gridLabel(self.loc("Kind"))
                                Picker("", selection: self.$scheduleKind) {
                                    Text(self.loc("at")).tag(ScheduleKind.at)
                                    Text(self.loc("every")).tag(ScheduleKind.every)
                                    Text(self.loc("cron")).tag(ScheduleKind.cron)
                                }
                                .labelsHidden()
                                .pickerStyle(.segmented)
                                .frame(maxWidth: .infinity)
                            }
                            GridRow {
                                Color.clear
                                    .frame(width: self.labelColumnWidth, height: 1)
                                Text(
                                    self.scheduleKindNote)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            switch self.scheduleKind {
                            case .at:
                                GridRow {
                                    self.gridLabel(self.loc("At"))
                                    DatePicker(
                                        "",
                                        selection: self.$atDate,
                                        displayedComponents: [.date, .hourAndMinute])
                                        .labelsHidden()
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                GridRow {
                                    self.gridLabel(self.loc("Auto-delete"))
                                    Toggle(self.loc("Delete after successful run"), isOn: self.$deleteAfterRun)
                                        .toggleStyle(.switch)
                                }
                            case .every:
                                GridRow {
                                    self.gridLabel(self.loc("Every"))
                                    TextField(self.loc("10m, 1h, 1d"), text: self.$everyText)
                                        .textFieldStyle(.roundedBorder)
                                        .frame(maxWidth: .infinity)
                                }
                            case .cron:
                                GridRow {
                                    self.gridLabel(self.loc("Expression"))
                                    TextField(self.loc("e.g. 0 9 * * 3"), text: self.$cronExpr)
                                        .textFieldStyle(.roundedBorder)
                                        .frame(maxWidth: .infinity)
                                }
                                GridRow {
                                    self.gridLabel(self.loc("Timezone"))
                                    TextField(self.loc("Optional (e.g. America/Los_Angeles)"), text: self.$cronTz)
                                        .textFieldStyle(.roundedBorder)
                                        .frame(maxWidth: .infinity)
                                }
                            }
                        }
                    }

                    GroupBox(self.loc("Payload")) {
                        VStack(alignment: .leading, spacing: 10) {
                            if self.isIsolatedLikeSessionTarget {
                                Text(self.isolatedPayloadNote)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                self.agentTurnEditor
                            } else {
                                Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 14, verticalSpacing: 10) {
                                    GridRow {
                                        self.gridLabel(self.loc("Kind"))
                                        Picker("", selection: self.$payloadKind) {
                                            Text(self.loc("systemEvent")).tag(PayloadKind.systemEvent)
                                            Text(self.loc("agentTurn")).tag(PayloadKind.agentTurn)
                                        }
                                        .labelsHidden()
                                        .pickerStyle(.segmented)
                                        .frame(maxWidth: .infinity)
                                    }
                                    GridRow {
                                        Color.clear
                                            .frame(width: self.labelColumnWidth, height: 1)
                                        Text(
                                            self.mainPayloadNote)
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }

                                switch self.payloadKind {
                                case .systemEvent:
                                    TextField(self.loc("System event text"), text: self.$systemEventText, axis: .vertical)
                                        .textFieldStyle(.roundedBorder)
                                        .lineLimit(3...7)
                                        .frame(maxWidth: .infinity)
                                case .agentTurn:
                                    self.agentTurnEditor
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 2)
            }

            if let error, !error.isEmpty {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Button(self.loc("Cancel")) { self.onCancel() }
                    .keyboardShortcut(.cancelAction)
                    .buttonStyle(.bordered)
                Spacer()
                Button {
                    self.save()
                } label: {
                    if self.isSaving {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(self.loc("Save"))
                    }
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(self.isSaving)
            }
        }
        .padding(24)
        .frame(
            minWidth: 720,
            minHeight: Self.minContentHeight(),
            idealHeight: Self.idealContentHeight(),
            maxHeight: Self.maxContentHeight(),
            alignment: .topLeading)
        .onAppear { self.hydrateFromJob() }
        .onChange(of: self.payloadKind) { _, newValue in
            if newValue == .agentTurn, self.sessionTarget == .main {
                self.sessionTarget = .isolated
            }
        }
        .onChange(of: self.sessionTarget) { oldValue, newValue in
            if oldValue != newValue {
                self.preservedSessionTargetRaw = nil
            }
            if newValue != .main {
                self.payloadKind = .agentTurn
            } else if newValue == .main, self.payloadKind == .agentTurn {
                self.payloadKind = .systemEvent
            }
        }
    }

    var agentTurnEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 14, verticalSpacing: 10) {
                GridRow {
                    self.gridLabel(self.loc("Message"))
                    TextField(self.loc("What should Maumau do?"), text: self.$agentMessage, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...7)
                        .frame(maxWidth: .infinity)
                }
                GridRow {
                    self.gridLabel(self.loc("Thinking"))
                    TextField(self.loc("Optional (e.g. low)"), text: self.$thinking)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity)
                }
                GridRow {
                    self.gridLabel(self.loc("Timeout"))
                    TextField(self.loc("Seconds (optional)"), text: self.$timeoutSeconds)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 180, alignment: .leading)
                }
                GridRow {
                    self.gridLabel(self.loc("Delivery"))
                    Picker("", selection: self.$deliveryMode) {
                        Text(self.loc("Announce summary")).tag(DeliveryChoice.announce)
                        Text(self.loc("None")).tag(DeliveryChoice.none)
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }
            }

            if self.deliveryMode == .announce {
                Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 14, verticalSpacing: 10) {
                    GridRow {
                        self.gridLabel(self.loc("Channel"))
                        Picker("", selection: self.$channel) {
                            ForEach(self.channelOptions, id: \.self) { channel in
                                Text(self.channelLabel(for: channel)).tag(channel)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.segmented)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    GridRow {
                        self.gridLabel(self.loc("To"))
                        TextField(self.loc("Optional override (phone number / chat id / Discord channel)"), text: self.$to)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: .infinity)
                    }
                    GridRow {
                        self.gridLabel(self.loc("Best-effort"))
                        Toggle(self.loc("Do not fail the job if announce fails"), isOn: self.$bestEffortDeliver)
                            .toggleStyle(.switch)
                    }
                }
            }
        }
    }
}
