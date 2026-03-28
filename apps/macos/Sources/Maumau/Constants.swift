import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-maumau writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.maumau.mac"
let gatewayLaunchdLabel = "ai.maumau.gateway"
let onboardingVersionKey = "maumau.onboardingVersion"
let onboardingSeenKey = "maumau.onboardingSeen"
let onboardingLanguageKey = "maumau.onboardingLanguage"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "maumau.pauseEnabled"
let iconAnimationsEnabledKey = "maumau.iconAnimationsEnabled"
let swabbleEnabledKey = "maumau.swabbleEnabled"
let swabbleTriggersKey = "maumau.swabbleTriggers"
let voiceWakeTriggerChimeKey = "maumau.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "maumau.voiceWakeSendChime"
let showDockIconKey = "maumau.showDockIcon"
let defaultVoiceWakeTriggers = ["maumau"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "maumau.voiceWakeMicID"
let voiceWakeMicNameKey = "maumau.voiceWakeMicName"
let voiceWakeLocaleKey = "maumau.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "maumau.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "maumau.voicePushToTalkEnabled"
let talkEnabledKey = "maumau.talkEnabled"
let iconOverrideKey = "maumau.iconOverride"
let connectionModeKey = "maumau.connectionMode"
let remoteTargetKey = "maumau.remoteTarget"
let remoteIdentityKey = "maumau.remoteIdentity"
let remoteProjectRootKey = "maumau.remoteProjectRoot"
let remoteCliPathKey = "maumau.remoteCliPath"
let canvasEnabledKey = "maumau.canvasEnabled"
let cameraEnabledKey = "maumau.cameraEnabled"
let systemRunPolicyKey = "maumau.systemRunPolicy"
let systemRunAllowlistKey = "maumau.systemRunAllowlist"
let systemRunEnabledKey = "maumau.systemRunEnabled"
let locationModeKey = "maumau.locationMode"
let locationPreciseKey = "maumau.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "maumau.peekabooBridgeEnabled"
let deepLinkKeyKey = "maumau.deepLinkKey"
let modelCatalogPathKey = "maumau.modelCatalogPath"
let modelCatalogReloadKey = "maumau.modelCatalogReload"
let cliInstallPromptedVersionKey = "maumau.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "maumau.heartbeatsEnabled"
let debugPaneEnabledKey = "maumau.debugPaneEnabled"
let debugFileLogEnabledKey = "maumau.debug.fileLogEnabled"
let appLogLevelKey = "maumau.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
