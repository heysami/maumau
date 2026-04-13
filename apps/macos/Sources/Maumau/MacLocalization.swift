import Foundation
import OSLog

private let onboardingLocalizationLogger = Logger(
    subsystem: "ai.maumau",
    category: "onboarding.i18n")

private let onboardingLocalizationEnglishMarkers = [
    "best for:",
    "what you need:",
    "how to get it:",
    "quality / caveat:",
    "web search",
    "search provider",
    "browser",
    "oauth",
    "provider",
    "api key",
    "model",
    "setup",
    "sign in",
    "sign-in",
    "choose ",
    "continue",
    "configured",
    "disabled",
    "available",
    "docs:",
    "official:",
]

private func macShouldWarnAboutUntranslatedWizardText(_ text: String, language: OnboardingLanguage) -> Bool {
    guard language != .en else { return false }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }
    if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
        return false
    }
    let lowered = trimmed.lowercased()
    return onboardingLocalizationEnglishMarkers.contains(where: lowered.contains)
}

private func macHelper(
    _ key: String,
    language: OnboardingLanguage,
    parameters: [String: String] = [:],
    fallback: String) -> String
{
    SharedLocalizationStore.string(
        path: ["mac", "helpers"] + key.split(separator: ".").map(String.init),
        languageID: language.replyLanguageID,
        parameters: parameters)
        ?? SharedLocalizationStore.interpolate(fallback, parameters: parameters)
}

func macLocalizedHelper(
    _ key: String,
    language: OnboardingLanguage,
    parameters: [String: String] = [:],
    fallback: String) -> String
{
    macHelper(key, language: language, parameters: parameters, fallback: fallback)
}

func macLocalized(_ english: String, language: OnboardingLanguage) -> String {
    if let exact = SharedLocalizationStore.macExactString(for: english, languageID: language.replyLanguageID) {
        return exact
    }
    if language == .id {
        return macLocalizedIndonesian(english)
    }
    if let derived = macLocalizedWizardDerived(english, language: language) {
        return derived
    }
    return english
}

func macCurrentLanguage() -> OnboardingLanguage {
    OnboardingLanguage.loadSelection(
        from: UserDefaults.standard.string(forKey: onboardingLanguageKey)) ?? .fallback
}

func macLocalized(_ english: String) -> String {
    macLocalized(english, language: macCurrentLanguage())
}

func macDisplayLocale(language: OnboardingLanguage) -> Locale {
    let localeID: String
    switch language {
    case .en:
        localeID = "en_US"
    case .id:
        localeID = "id_ID"
    case .zhCN:
        localeID = "zh_CN"
    case .ms:
        localeID = "ms_MY"
    case .th:
        localeID = "th_TH"
    case .vi:
        localeID = "vi_VN"
    case .fil:
        localeID = "fil_PH"
    case .my:
        localeID = "my_MM"
    case .jv:
        localeID = "jv_ID"
    case .su:
        localeID = "su_ID"
    case .btk:
        localeID = "bbc_ID"
    case .min:
        localeID = "min_ID"
    case .ban:
        localeID = "ban_ID"
    case .bug:
        localeID = "id_ID"
    case .mak:
        localeID = "mak_ID"
    case .minahasa:
        localeID = "id_ID"
    case .mad:
        localeID = "mad_ID"
    }
    return Locale(identifier: localeID)
}

func macWizardText(_ raw: String?, language: OnboardingLanguage) -> String? {
    guard let raw else { return nil }
    let localized = macLocalized(raw, language: language)
    if localized == raw, macShouldWarnAboutUntranslatedWizardText(raw, language: language) {
        onboardingLocalizationLogger.warning("missing onboarding localization: \(raw, privacy: .public)")
    }
    return localized
}

private func macLocalizedWizardDerived(_ english: String, language: OnboardingLanguage) -> String? {
    if let payload = macLocalizedTypedErrorPayload(english) {
        return macLocalized(payload, language: language)
    }

    if english.contains("\n") {
        return english
            .components(separatedBy: "\n")
            .map { macLocalized($0, language: language) }
            .joined(separator: "\n")
    }

    if english == "OpenAI Codex (ChatGPT OAuth)" {
        let localizedCodexOAuth = macLocalized("OpenAI Codex OAuth", language: language)
        if let localizedCodex = localizedCodexOAuth.stripSuffix(" OAuth") {
            return "\(localizedCodex) (ChatGPT OAuth)"
        }
        return "\(localizedCodexOAuth) (ChatGPT OAuth)"
    }

    if let provider = english.stripPrefix("How do you want to connect ")?.stripSuffix("?") {
        return macHelper(
            "wizard.connectQuestion",
            language: language,
            parameters: ["provider": macLocalized(provider, language: language)],
            fallback: "How do you want to connect {provider}?")
    }

    if let provider = english.stripPrefix("Before you choose ") {
        return macHelper(
            "wizard.beforeYouChoose",
            language: language,
            parameters: ["provider": macLocalized(provider, language: language)],
            fallback: "Before you choose {provider}")
    }

    if let detail = english.stripPrefix("Best for: ") {
        return macHelper(
            "wizard.bestFor",
            language: language,
            parameters: ["detail": macLocalized(detail, language: language)],
            fallback: "Best for: {detail}")
    }

    if let detail = english.stripPrefix("What you need: ") {
        return macHelper(
            "wizard.whatYouNeed",
            language: language,
            parameters: ["detail": macLocalized(detail, language: language)],
            fallback: "What you need: {detail}")
    }

    if let detail = english.stripPrefix("How to get it: ") {
        return macHelper(
            "wizard.howToGetIt",
            language: language,
            parameters: ["detail": macLocalized(detail, language: language)],
            fallback: "How to get it: {detail}")
    }

    if let detail = english.stripPrefix("Quality / caveat: ") {
        return macHelper(
            "wizard.qualityCaveat",
            language: language,
            parameters: ["detail": macLocalized(detail, language: language)],
            fallback: "Quality / caveat: {detail}")
    }

    if let url = english.stripPrefix("Official: ") {
        return macHelper(
            "wizard.official",
            language: language,
            parameters: ["url": url],
            fallback: "Official: {url}")
    }

    if let url = english.stripPrefix("Docs: ") {
        return macHelper(
            "wizard.docs",
            language: language,
            parameters: ["url": url],
            fallback: "Docs: {url}")
    }

    return nil
}

func macSessionSubtitle(count: Int, language: OnboardingLanguage) -> String {
    if count == 1 {
        return macHelper("sessionSubtitle.one", language: language, fallback: "1 session · 24h")
    }
    return macHelper(
        "sessionSubtitle.other",
        language: language,
        parameters: ["count": String(count)],
        fallback: "{count} sessions · 24h")
}

func macPairingPendingText(count: Int, repairCount: Int, device: Bool, language: OnboardingLanguage) -> String {
    let repairSuffix = repairCount > 0
        ? macHelper(
            "pairingPending.repairSuffix",
            language: language,
            parameters: ["repairCount": String(repairCount)],
            fallback: " · {repairCount} repair")
        : ""
    return macHelper(
        device ? "pairingPending.device" : "pairingPending.approval",
        language: language,
        parameters: [
            "count": String(count),
            "repairSuffix": repairSuffix,
        ],
        fallback: device
            ? "Device pairing pending ({count}){repairSuffix}"
            : "Pairing approval pending ({count}){repairSuffix}")
}

func macInstalledRequired(installed: String, required: String, language: OnboardingLanguage) -> String {
    macHelper(
        "installedRequired",
        language: language,
        parameters: ["installed": installed, "required": required],
        fallback: "Installed: {installed} · Required: {required}")
}

func macGatewayDetected(version: String, language: OnboardingLanguage) -> String {
    macHelper(
        "gatewayDetected",
        language: language,
        parameters: ["version": version],
        fallback: "Gateway {version} detected")
}

func macCliInstalledAt(_ path: String, language: OnboardingLanguage) -> String {
    macHelper("cliInstalledAt", language: language, parameters: ["path": path], fallback: "CLI installed at {path}")
}

func macLastFailure(_ failure: String, language: OnboardingLanguage) -> String {
    macHelper("lastFailure", language: language, parameters: ["failure": failure], fallback: "Last failure: {failure}")
}

func macLaunchdAutostart(_ label: String, language: OnboardingLanguage) -> String {
    macHelper(
        "launchdAutostart",
        language: language,
        parameters: ["label": label],
        fallback: "Gateway auto-starts in local mode via launchd ({label}).")
}

func macHealthAuthAge(label: String, age: String, language: OnboardingLanguage) -> String {
    macHelper(
        "healthAuthAge",
        language: language,
        parameters: ["label": label, "age": age],
        fallback: "{label} auth age: {age}")
}

func macSessionStoreStatus(path: String, count: Int, language: OnboardingLanguage) -> String {
    macHelper(
        "sessionStoreStatus",
        language: language,
        parameters: ["path": path, "count": String(count)],
        fallback: "Session store: {path} ({count} entries)")
}

func macLastActivity(key: String, age: String, language: OnboardingLanguage) -> String {
    macHelper(
        "lastActivity",
        language: language,
        parameters: ["key": key, "age": age],
        fallback: "Last activity: {key} {age}")
}

func macPrivateLinkLabel(isPublic: Bool, language: OnboardingLanguage) -> String {
    macHelper(
        isPublic ? "privateLinkLabel.public" : "privateLinkLabel.private",
        language: language,
        fallback: isPublic ? "Public link:" : "Private link:")
}

func macGatewayStatusTitle(_ status: String, language: OnboardingLanguage) -> String {
    let helperKey: String
    switch status {
    case "Connected via paired device":
        helperKey = "gatewayStatusTitle.connectedViaPairedDevice"
    case "Connected with setup code":
        helperKey = "gatewayStatusTitle.connectedWithSetupCode"
    case "Connected with gateway token":
        helperKey = "gatewayStatusTitle.connectedWithGatewayToken"
    case "Connected with password":
        helperKey = "gatewayStatusTitle.connectedWithPassword"
    case "Remote gateway ready":
        helperKey = "gatewayStatusTitle.remoteGatewayReady"
    default:
        return status
    }
    return macHelper(helperKey, language: language, fallback: status)
}

func macGatewayStatusDetail(_ detail: String?, language: OnboardingLanguage) -> String? {
    guard let detail else { return nil }
    switch detail {
    case "This Mac used a stored device token. New or unpaired devices may still need the gateway token.":
        return macHelper(
            "gatewayStatusDetail.storedDeviceToken",
            language: language,
            fallback: detail)
    case "This Mac is still using the temporary setup code. Approve pairing to finish provisioning device-scoped auth.":
        return macHelper(
            "gatewayStatusDetail.temporarySetupCode",
            language: language,
            fallback: detail)
    default:
        return detail
    }
}

func macAuthIssueText(_ english: String, language: OnboardingLanguage) -> String {
    macLocalized(english, language: language)
}

func macDefaultSkillsReady(_ names: String, language: OnboardingLanguage) -> String {
    macHelper("defaultSkillsReady", language: language, parameters: ["names": names], fallback: "Default skills already ready: {names}")
}

func macInstallingDefaultSkills(language: OnboardingLanguage) -> String {
    macHelper("installingDefaultSkills", language: language, fallback: "Installing default skills on this Mac...")
}

func macInstalledDefaultSkills(_ names: String, retry: String?, language: OnboardingLanguage) -> String {
    if let retry, !retry.isEmpty {
        return macHelper(
            "installedDefaultSkills.retry",
            language: language,
            parameters: ["names": names, "retry": retry],
            fallback: "Installed default skills: {names}; retry later for {retry}")
    }
    return macHelper(
        "installedDefaultSkills.default",
        language: language,
        parameters: ["names": names],
        fallback: "Installed default skills: {names}")
}

func macAutoInstallDefaultSkillsFailed(_ names: String, language: OnboardingLanguage) -> String {
    macHelper(
        "autoInstallDefaultSkillsFailed",
        language: language,
        parameters: ["names": names],
        fallback: "Couldn’t auto-install default skills yet: {names}")
}

func macSwitchedToLocalModeForInstall(language: OnboardingLanguage) -> String {
    macHelper("switchedToLocalModeForInstall", language: language, fallback: "Switched to Local mode to install on this Mac")
}

func macSkillEnabledChanged(enabled: Bool, language: OnboardingLanguage) -> String {
    macHelper(
        enabled ? "skillEnabledChanged.enabled" : "skillEnabledChanged.disabled",
        language: language,
        fallback: enabled ? "Skill enabled" : "Skill disabled")
}

func macSavedApiKeyStatus(skillKey: String, language: OnboardingLanguage) -> String {
    macHelper(
        "savedApiKeyStatus",
        language: language,
        parameters: ["skillKey": skillKey],
        fallback: "Saved API key — stored in maumau.json (skills.entries.{skillKey})")
}

func macSavedEnvStatus(envKey: String, skillKey: String, language: OnboardingLanguage) -> String {
    macHelper(
        "savedEnvStatus",
        language: language,
        parameters: ["envKey": envKey, "skillKey": skillKey],
        fallback: "Saved {envKey} — stored in maumau.json (skills.entries.{skillKey}.env)")
}

func macPluginsLoadedSummary(loaded: Int, total: Int, language: OnboardingLanguage) -> String {
    macHelper(
        "pluginsLoadedSummary",
        language: language,
        parameters: ["loaded": String(loaded), "total": String(total)],
        fallback: "{loaded}/{total} loaded")
}

func macGlobalDiagnosticsSummary(count: Int, language: OnboardingLanguage) -> String {
    if count == 1 {
        return macHelper("globalDiagnostics.one", language: language, fallback: "1 global diagnostic")
    }
    return macHelper(
        "globalDiagnostics.other",
        language: language,
        parameters: ["count": String(count)],
        fallback: "{count} global diagnostics")
}

func macVoiceWakeHeard(_ text: String, language: OnboardingLanguage) -> String {
    macHelper("voiceWakeHeard", language: language, parameters: ["text": text], fallback: "Heard: {text}")
}

func macVoiceWakeFailureText(_ reason: String, language: OnboardingLanguage) -> String {
    if let heard = reason.stripPrefix("Heard: ") {
        return macVoiceWakeHeard(heard, language: language)
    }
    if let command = reason.stripPrefix("No trigger heard: “")?.stripSuffix("”") {
        return macHelper(
            "voiceWakeFailure.noTriggerHeard",
            language: language,
            parameters: ["command": command],
            fallback: "No trigger heard: “{command}”")
    }
    return macLocalized(reason, language: language)
}

func macVoiceWakeLocaleLabel(_ name: String, isSystem: Bool, language: OnboardingLanguage) -> String {
    guard isSystem else { return name }
    return macHelper(
        "voiceWakeLocaleLabel.system",
        language: language,
        parameters: ["name": name],
        fallback: "{name} (System)")
}

func macDiscoveryStatus(_ status: String, language: OnboardingLanguage) -> String {
    if status == "Searching..." || status == "Searching…" {
        return macHelper("discoveryStatus.searching", language: language, fallback: "Searching…")
    }
    if let count = Int(status.stripPrefix("Found ") ?? "") {
        return macHelper(
            "discoveryStatus.found",
            language: language,
            parameters: ["count": String(count)],
            fallback: "Found {count}")
    }
    return macLocalized(status, language: language)
}

func macDeepLinkMessageTooLong(max: Int, actual: Int, language: OnboardingLanguage) -> String {
    macHelper(
        "deepLinkMessageTooLong",
        language: language,
        parameters: ["max": String(max), "actual": String(actual)],
        fallback: "Message is too long to confirm safely ({actual} chars; max {max} without key).")
}

func macDeepLinkRunBody(messagePreview: String, urlPreview: String, language: OnboardingLanguage) -> String {
    macHelper(
        "deepLinkRunBody",
        language: language,
        parameters: ["messagePreview": messagePreview, "urlPreview": urlPreview],
        fallback: "Run the agent with this message?\n\n{messagePreview}\n\nURL:\n{urlPreview}")
}

private extension String {
    func stripPrefix(_ prefix: String) -> String? {
        guard self.hasPrefix(prefix) else { return nil }
        return String(self.dropFirst(prefix.count))
    }

    func stripSuffix(_ suffix: String) -> String? {
        guard self.hasSuffix(suffix) else { return nil }
        return String(self.dropLast(suffix.count))
    }
}

private func macLocalizedIndonesian(_ english: String) -> String {
    if let payload = macLocalizedTypedErrorPayload(english) {
        return macLocalized(payload, language: .id)
    }

    if english.contains("\n") {
        return english
            .components(separatedBy: "\n")
            .map { macLocalized($0, language: .id) }
            .joined(separator: "\n")
    }

    if let provider = english.stripPrefix("How do you want to connect ")?.stripSuffix("?") {
        return "Bagaimana Anda ingin menghubungkan \(macLocalized(provider, language: .id))?"
    }

    if let provider = english.stripPrefix("Before you choose ") {
        return "Sebelum memilih \(macLocalized(provider, language: .id))"
    }

    if let provider = english.stripSuffix(" OAuth prerequisites check failed: Node/OpenSSL cannot validate TLS certificates.") {
        return "Pemeriksaan prasyarat \(provider) OAuth gagal: Node/OpenSSL tidak bisa memvalidasi sertifikat TLS."
    }

    if let detail = english.stripPrefix("Best for: ") {
        return "Cocok untuk: \(macLocalized(detail, language: .id))"
    }

    if let detail = english.stripPrefix("What you need: ") {
        return "Yang Anda butuhkan: \(macLocalized(detail, language: .id))"
    }

    if let detail = english.stripPrefix("How to get it: ") {
        return "Cara mendapatkannya: \(macLocalized(detail, language: .id))"
    }

    if let detail = english.stripPrefix("Quality / caveat: ") {
        return "Kualitas / catatan: \(macLocalized(detail, language: .id))"
    }

    if let url = english.stripPrefix("Official: ") {
        return "Resmi: \(url)"
    }

    if let url = english.stripPrefix("Docs: ") {
        return "Dokumentasi: \(url)"
    }

    if let model = english.stripPrefix("Default model set to ") {
        return "Model default diatur ke \(model)"
    }

    if let model = english.stripPrefix("Default model available: ")?
        .stripSuffix(" (use --set-default to apply)")
    {
        return "Model default tersedia: \(model) (gunakan --set-default untuk menerapkan)"
    }

    if let envVar = english.stripPrefix("Environment variable \"")?
        .stripSuffix("\" is missing or empty.")
    {
        return "Variabel lingkungan \"\(envVar)\" tidak ada atau kosong."
    }

    if let provider = english.stripPrefix("Web search provider ")?
        .stripSuffix(" is selected but unavailable under the current plugin policy.")
    {
        return "Provider pencarian web \(provider) dipilih tetapi tidak tersedia di kebijakan plugin saat ini."
    }

    if let provider = english.stripSuffix(" works without an API key.") {
        return "\(provider) bekerja tanpa API key."
    }

    if let credential = english.stripPrefix("No ")?
        .stripSuffix(" stored — web_search won't work until a key is available.")
    {
        return "Belum ada \(credential) yang tersimpan — web_search tidak akan berfungsi sampai ada key yang tersedia."
    }

    if let url = english.stripPrefix("Get your key at: ") {
        return "Ambil key Anda di: \(url)"
    }

    if let url = english.stripPrefix("Get your API key at: ") {
        return "Ambil API key Anda di: \(url)"
    }

    if let env = english.stripPrefix("Env var: ") {
        return "Variabel env: \(env)"
    }

    if let envVar = english.stripPrefix("Set ")?
        .stripSuffix(" in the Gateway environment.")
    {
        return "Setel \(envVar) di lingkungan Gateway."
    }

    if let range = english.range(of: " here or set "),
       english.hasPrefix("Store your "),
       english.hasSuffix(" in the Gateway environment.")
    {
        let start = english.index(english.startIndex, offsetBy: "Store your ".count)
        let credential = String(english[start..<range.lowerBound])
        let env = String(english[range.upperBound..<english.endIndex])
            .stripSuffix(" in the Gateway environment.") ?? ""
        return "Simpan \(credential) Anda di sini atau setel \(env) di lingkungan Gateway."
    }

    if let provider = english.stripPrefix("Provider ")?
        .stripSuffix(" is selected but no API key was found.")
    {
        return "Provider \(provider) dipilih tetapi tidak ditemukan API key."
    }

    if let provider = english.stripPrefix("Web search (")?
        .stripSuffix(") is configured but disabled.")
    {
        return "Pencarian web (\(provider)) sudah dikonfigurasi tetapi dinonaktifkan."
    }

    if let provider = english.stripPrefix("Web search is available via ")?
        .stripSuffix(" (auto-detected).")
    {
        return "Pencarian web tersedia melalui \(provider) (terdeteksi otomatis)."
    }

    if let command = english.stripPrefix("Re-enable: ") {
        return "Aktifkan lagi: \(command)"
    }

    if let source = english.stripPrefix("API key: provided via ")?
        .stripSuffix(" env var.")
    {
        return "API key: disediakan melalui variabel env \(source)."
    }

    if let credential = english.stripSuffix(" (leave blank to keep current)") {
        return "\(macLocalized(credential, language: .id)) (biarkan kosong untuk mempertahankan yang sekarang)"
    }

    if let credential = english.stripSuffix(" (leave blank to use env var)") {
        return "\(macLocalized(credential, language: .id)) (biarkan kosong untuk memakai variabel env)"
    }

    if let range = english.range(of: " (leave blank to keep current or use "),
       english.hasSuffix(")")
    {
        let credential = String(english[..<range.lowerBound])
        let envStart = range.upperBound
        let envEnd = english.index(before: english.endIndex)
        let env = String(english[envStart..<envEnd])
        return "\(macLocalized(credential, language: .id)) (biarkan kosong untuk mempertahankan yang sekarang atau gunakan \(env))"
    }

    if let range = english.range(of: " (paste it here; leave blank to use "),
       english.hasSuffix(")")
    {
        let credential = String(english[..<range.lowerBound])
        let envStart = range.upperBound
        let envEnd = english.index(before: english.endIndex)
        let env = String(english[envStart..<envEnd])
        return "\(macLocalized(credential, language: .id)) (tempelkan di sini; biarkan kosong untuk memakai \(env))"
    }

    if let detail = english.stripPrefix("Config was written to "),
       let separator = detail.range(of: ", but runtime snapshot refresh failed: ")
    {
        let path = String(detail[..<separator.lowerBound])
        let reason = String(detail[separator.upperBound...])
        return "Konfigurasi ditulis ke \(path), tetapi refresh snapshot runtime gagal: \(macLocalized(reason, language: .id))"
    }

    if let provider = english.stripSuffix(" API key") {
        return "API key \(provider)"
    }

    if let hint = english.stripSuffix(" · configured") {
        return "\(macLocalized(hint, language: .id)) · dikonfigurasi"
    }

    if let hint = english.stripSuffix(" · key-free") {
        return "\(macLocalized(hint, language: .id)) · tanpa key"
    }

    if let detail = english.stripPrefix("Cause: ") {
        return "Penyebab: \(detail)"
    }

    if let path = english.stripPrefix("- Verify cert bundle exists: ") {
        return "- Verifikasi bahwa bundel sertifikat ada: \(path)"
    }

    if let platform = english.stripPrefix("Fix (")?.stripSuffix("):") {
        return "Perbaikan (\(platform)):"
    }

    if english == "- Retry the OAuth login flow." {
        return "- Coba lagi alur login OAuth."
    }

    return english
}

private func macLocalizedTypedErrorPayload(_ english: String) -> String? {
    if let payload = english.stripPrefix("ConfigRuntimeRefreshError: ") {
        return payload
    }

    guard let separator = english.range(of: ": ") else { return nil }
    let prefix = String(english[..<separator.lowerBound])
    guard prefix.hasSuffix("Error"), !prefix.contains(" ") else { return nil }
    return String(english[separator.upperBound...])
}
