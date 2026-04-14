import SwiftUI

extension CronSettings {
    func jobRow(_ job: CronJob) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(job.displayName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer()
                if !job.enabled {
                    StatusPill(text: self.loc("disabled"), tint: .secondary)
                } else if let next = job.nextRunDate {
                    StatusPill(text: self.nextRunLabel(next), tint: .secondary)
                } else {
                    StatusPill(text: self.loc("no next run"), tint: .secondary)
                }
            }
            HStack(spacing: 6) {
                StatusPill(text: job.sessionTargetDisplayValue, tint: .secondary)
                StatusPill(text: self.localizedWakeMode(job.wakeMode), tint: .secondary)
                if let agentId = job.agentId, !agentId.isEmpty {
                    StatusPill(text: "\(self.loc("agent")) \(agentId)", tint: .secondary)
                }
                if let status = job.state.lastStatus {
                    StatusPill(text: self.localizedCronStatus(status), tint: status == "ok" ? .green : .orange)
                }
            }
        }
        .padding(.vertical, 6)
    }

    @ViewBuilder
    func jobContextMenu(_ job: CronJob) -> some View {
        Button(self.loc("Run now")) { Task { await self.store.runJob(id: job.id, force: true) } }
        if let transcriptSessionKey = job.transcriptSessionKey {
            Button(self.loc("Open transcript")) {
                WebChatManager.shared.show(sessionKey: transcriptSessionKey)
            }
        }
        Divider()
        Button(job.enabled ? self.loc("Disable") : self.loc("Enable")) {
            Task { await self.store.setJobEnabled(id: job.id, enabled: !job.enabled) }
        }
        Button(self.loc("Edit…")) {
            self.editingJob = job
            self.editorError = nil
            self.showEditor = true
        }
        Divider()
        Button(self.loc("Delete…"), role: .destructive) {
            self.confirmDelete = job
        }
    }

    func detailHeader(_ job: CronJob) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text(job.displayName)
                    .font(.title3.weight(.semibold))
                Text(job.id)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            HStack(spacing: 8) {
                Toggle(self.loc("Enabled"), isOn: Binding(
                    get: { job.enabled },
                    set: { enabled in Task { await self.store.setJobEnabled(id: job.id, enabled: enabled) } }))
                    .toggleStyle(.switch)
                    .labelsHidden()
                Button(self.loc("Run")) { Task { await self.store.runJob(id: job.id, force: true) } }
                    .buttonStyle(.borderedProminent)
                if let transcriptSessionKey = job.transcriptSessionKey {
                    Button(self.loc("Transcript")) {
                        WebChatManager.shared.show(sessionKey: transcriptSessionKey)
                    }
                    .buttonStyle(.bordered)
                }
                Button(self.loc("Edit")) {
                    self.editingJob = job
                    self.editorError = nil
                    self.showEditor = true
                }
                .buttonStyle(.bordered)
            }
        }
    }

    func detailCard(_ job: CronJob) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LabeledContent(self.loc("Schedule")) { Text(self.scheduleSummary(job.schedule)).font(.callout) }
            if case .at = job.schedule, job.deleteAfterRun == true {
                LabeledContent(self.loc("Auto-delete")) { Text(self.loc("after success")) }
            }
            if let desc = job.description, !desc.isEmpty {
                LabeledContent(self.loc("Description")) { Text(desc).font(.callout) }
            }
            if let agentId = job.agentId, !agentId.isEmpty {
                LabeledContent(self.loc("Agent")) { Text(agentId) }
            }
            LabeledContent(self.loc("Session")) { Text(job.sessionTargetDisplayValue) }
            LabeledContent(self.loc("Wake")) { Text(self.localizedWakeMode(job.wakeMode)) }
            LabeledContent(self.loc("Next run")) {
                if let date = job.nextRunDate {
                    Text(date.formatted(date: .abbreviated, time: .standard))
                } else {
                    Text("—").foregroundStyle(.secondary)
                }
            }
            LabeledContent(self.loc("Last run")) {
                if let date = job.lastRunDate {
                    Text("\(date.formatted(date: .abbreviated, time: .standard)) · \(relativeAge(from: date))")
                } else {
                    Text("—").foregroundStyle(.secondary)
                }
            }
            if let status = job.state.lastStatus {
                LabeledContent(self.loc("Last status")) { Text(self.localizedCronStatus(status)) }
            }
            if let err = job.state.lastError, !err.isEmpty {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .textSelection(.enabled)
            }
            self.payloadSummary(job)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.secondary.opacity(0.06))
        .cornerRadius(8)
    }

    func runHistoryCard(_ job: CronJob) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(self.loc("Run history"))
                    .font(.headline)
                Spacer()
                Button {
                    Task { await self.store.refreshRuns(jobId: job.id) }
                } label: {
                    Label(self.loc("Refresh"), systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(self.store.isLoadingRuns)
            }

            if self.store.isLoadingRuns {
                ProgressView().controlSize(.small)
            }

            if self.store.runEntries.isEmpty {
                Text(self.loc("No run log entries yet."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(self.store.runEntries) { entry in
                        self.runRow(entry)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.secondary.opacity(0.06))
        .cornerRadius(8)
    }

    func runRow(_ entry: CronRunLogEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                StatusPill(text: self.localizedCronStatus(entry.status ?? "unknown"), tint: self.statusTint(entry.status))
                Text(entry.date.formatted(date: .abbreviated, time: .standard))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if let ms = entry.durationMs {
                    Text("\(ms)ms")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            if let summary = entry.summary, !summary.isEmpty {
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .lineLimit(2)
            }
            if let error = entry.error, !error.isEmpty {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .textSelection(.enabled)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }

    func payloadSummary(_ job: CronJob) -> some View {
        let payload = job.payload
        return VStack(alignment: .leading, spacing: 6) {
            Text(self.loc("Payload"))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            switch payload {
            case let .systemEvent(text):
                Text(text)
                    .font(.callout)
                    .textSelection(.enabled)
            case let .agentTurn(message, thinking, timeoutSeconds, _, _, _, _):
                VStack(alignment: .leading, spacing: 4) {
                    Text(message)
                        .font(.callout)
                        .textSelection(.enabled)
                    HStack(spacing: 8) {
                        if let thinking, !thinking.isEmpty {
                            StatusPill(
                                text: macLocalizedHelper(
                                    "thinkingFlag",
                                    language: self.language,
                                    parameters: ["value": thinking],
                                    fallback: "think {value}"),
                                tint: .secondary)
                        }
                        if let timeoutSeconds { StatusPill(text: "\(timeoutSeconds)s", tint: .secondary) }
                        if job.supportsAnnounceDelivery {
                            let delivery = job.delivery
                            if let delivery {
                                if delivery.mode == .announce {
                                    StatusPill(text: self.loc("announce"), tint: .secondary)
                                    if let channel = delivery.channel, !channel.isEmpty {
                                        StatusPill(text: channel, tint: .secondary)
                                    }
                                    if let to = delivery.to, !to.isEmpty { StatusPill(text: to, tint: .secondary) }
                                } else {
                                    StatusPill(text: self.loc("no delivery"), tint: .secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func localizedWakeMode(_ wakeMode: CronWakeMode) -> String {
        switch wakeMode {
        case .now:
            self.loc("now")
        case .nextHeartbeat:
            self.loc("next-heartbeat")
        }
    }

    private func localizedCronStatus(_ status: String) -> String {
        switch status.lowercased() {
        case "ok":
            self.loc("ok")
        case "error":
            self.loc("error")
        case "skipped":
            self.loc("skipped")
        case "unknown":
            self.loc("unknown")
        default:
            status
        }
    }
}
