import Foundation

/// Human-friendly age string (e.g., "2m ago").
func age(from date: Date, now: Date = .init()) -> String {
    let language = macCurrentLanguage()
    let seconds = max(0, Int(now.timeIntervalSince(date)))
    let minutes = seconds / 60
    let hours = minutes / 60
    let days = hours / 24

    if seconds < 60 {
        return macLocalizedHelper("age.justNow", language: language, fallback: "just now")
    }
    if minutes == 1 {
        return macLocalizedHelper("age.minuteAgo", language: language, fallback: "1 minute ago")
    }
    if minutes < 60 {
        return macLocalizedHelper(
            "age.minutesAgo",
            language: language,
            parameters: ["count": String(minutes)],
            fallback: "{count} minutes ago")
    }
    if hours == 1 {
        return macLocalizedHelper("age.hourAgo", language: language, fallback: "1 hour ago")
    }
    if hours < 24 {
        return macLocalizedHelper(
            "age.hoursAgo",
            language: language,
            parameters: ["count": String(hours)],
            fallback: "{count} hours ago")
    }
    if days == 1 {
        return macLocalizedHelper("age.yesterday", language: language, fallback: "yesterday")
    }
    return macLocalizedHelper(
        "age.daysAgo",
        language: language,
        parameters: ["count": String(days)],
        fallback: "{count} days ago")
}
