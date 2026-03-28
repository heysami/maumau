import SwiftUI

extension CronSettings {
    var selectedJobIdBinding: Binding<String?> {
        Binding(
            get: { self.store.selectedJobId },
            set: { newValue in
                self.store.selectedJobId = newValue
                guard let newValue else {
                    self.store.runEntries = []
                    return
                }
                Task { await self.store.refreshRuns(jobId: newValue) }
            })
    }

    var selectedJob: CronJob? {
        guard let id = self.store.selectedJobId else { return nil }
        return self.store.jobs.first(where: { $0.id == id })
    }

    func statusTint(_ status: String?) -> Color {
        switch (status ?? "").lowercased() {
        case "ok": .green
        case "error": .red
        case "skipped": .orange
        default: .secondary
        }
    }

    func scheduleSummary(_ schedule: CronSchedule) -> String {
        switch schedule {
        case let .at(at):
            if let date = CronSchedule.parseAtDate(at) {
                return self.language == .id
                    ? "pada \(date.formatted(date: .abbreviated, time: .standard))"
                    : "at \(date.formatted(date: .abbreviated, time: .standard))"
            }
            return self.language == .id ? "pada \(at)" : "at \(at)"
        case let .every(everyMs, _):
            return self.language == .id
                ? "setiap \(self.formatDuration(ms: everyMs))"
                : "every \(self.formatDuration(ms: everyMs))"
        case let .cron(expr, tz):
            if let tz, !tz.isEmpty { return "cron \(expr) (\(tz))" }
            return "cron \(expr)"
        }
    }

    func formatDuration(ms: Int) -> String {
        DurationFormattingSupport.conciseDuration(ms: ms)
    }

    func nextRunLabel(_ date: Date, now: Date = .init()) -> String {
        let delta = date.timeIntervalSince(now)
        if delta <= 0 { return self.loc("due") }
        if delta < 60 { return self.loc("in <1m") }
        let minutes = Int(round(delta / 60))
        if minutes < 60 { return self.language == .id ? "dalam \(minutes)m" : "in \(minutes)m" }
        let hours = Int(round(Double(minutes) / 60))
        if hours < 48 { return self.language == .id ? "dalam \(hours)j" : "in \(hours)h" }
        let days = Int(round(Double(hours) / 24))
        return self.language == .id ? "dalam \(days)h" : "in \(days)d"
    }
}
