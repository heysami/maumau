import Foundation

/// Human-friendly age string (e.g., "2m ago").
func age(from date: Date, now: Date = .init()) -> String {
    let language = macCurrentLanguage()
    let seconds = max(0, Int(now.timeIntervalSince(date)))
    let minutes = seconds / 60
    let hours = minutes / 60
    let days = hours / 24

    if language == .id {
        if seconds < 60 { return "baru saja" }
        if minutes == 1 { return "1 menit lalu" }
        if minutes < 60 { return "\(minutes) menit lalu" }
        if hours == 1 { return "1 jam lalu" }
        if hours < 24 { return "\(hours) jam lalu" }
        if days == 1 { return "kemarin" }
        return "\(days) hari lalu"
    }

    if seconds < 60 { return "just now" }
    if minutes == 1 { return "1 minute ago" }
    if minutes < 60 { return "\(minutes)m ago" }
    if hours == 1 { return "1 hour ago" }
    if hours < 24 { return "\(hours)h ago" }
    if days == 1 { return "yesterday" }
    return "\(days)d ago"
}
