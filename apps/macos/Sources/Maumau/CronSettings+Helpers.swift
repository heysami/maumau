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
                return macLocalizedHelper(
                    "scheduleSummary.at",
                    language: self.language,
                    parameters: ["value": date.formatted(date: .abbreviated, time: .standard)],
                    fallback: "at {value}")
            }
            return macLocalizedHelper(
                "scheduleSummary.at",
                language: self.language,
                parameters: ["value": at],
                fallback: "at {value}")
        case let .every(everyMs, _):
            return macLocalizedHelper(
                "scheduleSummary.every",
                language: self.language,
                parameters: ["value": self.formatDuration(ms: everyMs)],
                fallback: "every {value}")
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
        if minutes < 60 {
            return macLocalizedHelper(
                "nextRun.inMinutes",
                language: self.language,
                parameters: ["count": String(minutes)],
                fallback: "in {count} minutes")
        }
        let hours = Int(round(Double(minutes) / 60))
        if hours < 48 {
            return macLocalizedHelper(
                "nextRun.inHours",
                language: self.language,
                parameters: ["count": String(hours)],
                fallback: "in {count} hours")
        }
        let days = Int(round(Double(hours) / 24))
        return macLocalizedHelper(
            "nextRun.inDays",
            language: self.language,
            parameters: ["count": String(days)],
            fallback: "in {count} days")
    }
}
