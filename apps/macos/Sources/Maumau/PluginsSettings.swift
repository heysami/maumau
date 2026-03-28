import Observation
import SwiftUI

struct PluginsSettings: View {
    @State private var model = PluginsSettingsModel()
    @State private var selectedPluginId: String?

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    init(model: PluginsSettingsModel = PluginsSettingsModel()) {
        self._model = State(initialValue: model)
    }

    var body: some View {
        HStack(spacing: 0) {
            self.sidebar
            self.detail
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .task { await self.model.refresh() }
        .onAppear { self.ensureSelection() }
        .onChange(of: self.model.plugins) { _, _ in
            self.ensureSelection()
        }
    }

    private var selectedPlugin: PluginStatusRecord? {
        self.model.plugins.first { $0.id == self.selectedPluginId }
    }

    private var loadedPlugins: [PluginStatusRecord] {
        self.model.plugins.filter { $0.status == "loaded" }
    }

    private var disabledPlugins: [PluginStatusRecord] {
        self.model.plugins.filter { $0.status == "disabled" }
    }

    private var errorPlugins: [PluginStatusRecord] {
        self.model.plugins.filter { $0.status == "error" }
    }

    private var globalDiagnostics: [PluginDiagnosticRecord] {
        self.model.diagnostics.filter { ($0.pluginId ?? "").isEmpty }
    }

    private var sidebar: some View {
        SettingsSidebarScroll {
            VStack(alignment: .leading, spacing: 8) {
                self.summaryCard

                if !self.loadedPlugins.isEmpty {
                    self.sidebarSectionHeader(macLocalized("Loaded", language: self.language))
                    ForEach(self.loadedPlugins) { plugin in
                        self.sidebarRow(plugin)
                    }
                }

                if !self.disabledPlugins.isEmpty {
                    self.sidebarSectionHeader(macLocalized("Disabled", language: self.language))
                    ForEach(self.disabledPlugins) { plugin in
                        self.sidebarRow(plugin)
                    }
                }

                if !self.errorPlugins.isEmpty {
                    self.sidebarSectionHeader(macLocalized("Needs Attention", language: self.language))
                    ForEach(self.errorPlugins) { plugin in
                        self.sidebarRow(plugin)
                    }
                }
            }
        }
    }

    private var detail: some View {
        Group {
            if let plugin = self.selectedPlugin {
                self.pluginDetail(plugin)
            } else {
                self.emptyDetail
            }
        }
        .frame(minWidth: 460, maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(macLocalized("Plugins", language: self.language))
                        .font(.headline)
                    Text(macLocalized("All discovered plugins, including ones that do not ship any Skills.", language: self.language))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                SettingsRefreshButton(isLoading: self.model.isLoading) {
                    Task { await self.model.refresh() }
                }
            }

            if let workspaceDir = self.model.workspaceDir,
               !workspaceDir.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            {
                Text(workspaceDir)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Text(macPluginsLoadedSummary(loaded: self.model.loadedCount, total: self.model.plugins.count, language: self.language))
                .font(.caption)
                .foregroundStyle(.secondary)

            if !self.globalDiagnostics.isEmpty {
                Text(macGlobalDiagnosticsSummary(count: self.globalDiagnostics.count, language: self.language))
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            if let error = self.model.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

    private var emptyDetail: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(macLocalized("Plugins", language: self.language))
                .font(.title3.weight(.semibold))
            Text(macLocalized("No plugins discovered yet.", language: self.language))
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
    }

    private func pluginDetail(_ plugin: PluginStatusRecord) -> some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 16) {
                self.detailHeader(plugin)
                self.packageSection(plugin)
                self.capabilitiesSection(plugin)
                self.runtimeSection(plugin)
                self.diagnosticsSection(plugin)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
            .groupBoxStyle(PlainSettingsGroupBoxStyle())
        }
    }

    private func detailHeader(_ plugin: PluginStatusRecord) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(plugin.displayName)
                    .font(.title3.weight(.semibold))
                self.statusBadge(plugin)
                Spacer()
            }

            if plugin.displayName != plugin.id {
                Text(plugin.id)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            if let description = plugin.description,
               !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            {
                Text(description)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                self.metaTag(plugin.originLabel)
                if let format = plugin.format,
                   !format.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    self.metaTag(format)
                }
                if let bundleFormat = plugin.bundleFormat,
                   !bundleFormat.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    self.metaTag(bundleFormat)
                }
                if let kind = plugin.kind,
                   !kind.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    self.metaTag(kind)
                }
            }
        }
    }

    private func packageSection(_ plugin: PluginStatusRecord) -> some View {
        GroupBox(macLocalized("Package", language: self.language)) {
            VStack(alignment: .leading, spacing: 10) {
                self.infoRow(macLocalized("Version", language: self.language), plugin.version ?? macLocalized("Unknown", language: self.language))
                self.infoRow(macLocalized("Config", language: self.language), plugin.configStateLabel)
                self.infoRow(macLocalized("Source", language: self.language), plugin.source, monospaced: true)
                if let workspaceDir = plugin.workspaceDir,
                   !workspaceDir.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    self.infoRow(macLocalized("Workspace", language: self.language), workspaceDir, monospaced: true)
                }
            }
        }
    }

    @ViewBuilder
    private func capabilitiesSection(_ plugin: PluginStatusRecord) -> some View {
        let sections = self.capabilitySections(for: plugin)
        GroupBox(macLocalized("Adds", language: self.language)) {
            if sections.isEmpty {
                Text(macLocalized("No plugin capabilities or routes are registered.", language: self.language))
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(sections, id: \.title) { section in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(section.title)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text(section.values.joined(separator: ", "))
                                .font(.callout)
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)
                        }
                    }
                }
            }
        }
    }

    private func runtimeSection(_ plugin: PluginStatusRecord) -> some View {
        GroupBox(macLocalized("Runtime", language: self.language)) {
            VStack(alignment: .leading, spacing: 10) {
                self.infoRow(macLocalized("Tools", language: self.language), "\(plugin.toolNames.count)")
                self.infoRow(macLocalized("Hooks", language: self.language), "\(plugin.hookCount)")
                self.infoRow(macLocalized("Commands", language: self.language), "\(plugin.commands.count)")
                self.infoRow(macLocalized("CLI Commands", language: self.language), "\(plugin.cliCommands.count)")
                self.infoRow(macLocalized("Services", language: self.language), "\(plugin.services.count)")
                self.infoRow(macLocalized("Gateway Methods", language: self.language), "\(plugin.gatewayMethods.count)")
                self.infoRow(macLocalized("HTTP Routes", language: self.language), "\(plugin.httpRoutes)")
                self.infoRow(macLocalized("Config Schema", language: self.language), plugin.configSchema ? macLocalized("Yes", language: self.language) : macLocalized("No", language: self.language))
                if let error = plugin.error,
                   !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    self.infoRow(macLocalized("Load Error", language: self.language), error)
                }
            }
        }
    }

    @ViewBuilder
    private func diagnosticsSection(_ plugin: PluginStatusRecord) -> some View {
        let diagnostics = self.model.diagnostics(for: plugin.id)
        if let pluginError = plugin.error,
           !pluginError.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !diagnostics.isEmpty
        {
            GroupBox(macLocalized("Diagnostics", language: self.language)) {
                VStack(alignment: .leading, spacing: 8) {
                    if let pluginError = plugin.error,
                       !pluginError.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    {
                        Text(pluginError)
                            .font(.callout)
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(diagnostics) { diagnostic in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(diagnostic.levelLabel)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(diagnostic.level == "error" ? .red : .orange)
                            Text(diagnostic.message)
                                .font(.callout)
                                .fixedSize(horizontal: false, vertical: true)
                            if let source = diagnostic.source,
                               !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            {
                                Text(source)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                        }
                    }
                }
            }
        }
    }

    private func sidebarRow(_ plugin: PluginStatusRecord) -> some View {
        let isSelected = self.selectedPluginId == plugin.id
        return Button {
            self.selectedPluginId = plugin.id
        } label: {
            HStack(spacing: 8) {
                Circle()
                    .fill(self.statusTint(for: plugin))
                    .frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 2) {
                    Text(plugin.displayName)
                    Text("\(plugin.originLabel) · \(plugin.statusLabel)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.accentColor.opacity(0.18) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func sidebarSectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .textCase(.uppercase)
            .padding(.horizontal, 4)
            .padding(.top, 2)
    }

    private func infoRow(_ label: String, _ value: String, monospaced: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            if monospaced {
                Text(value)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(value)
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
    }

    private func metaTag(_ text: String) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.secondary.opacity(0.12))
            .foregroundStyle(.secondary)
            .clipShape(Capsule())
    }

    private func statusBadge(_ plugin: PluginStatusRecord) -> some View {
        Text(plugin.statusLabel)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(self.statusTint(for: plugin).opacity(0.16))
            .foregroundStyle(self.statusTint(for: plugin))
            .clipShape(Capsule())
    }

    private func statusTint(for plugin: PluginStatusRecord) -> Color {
        switch plugin.status {
        case "loaded":
            .green
        case "disabled":
            .secondary
        case "error":
            .red
        default:
            .secondary
        }
    }

    private func capabilitySections(for plugin: PluginStatusRecord) -> [(title: String, values: [String])] {
        [
            (macLocalized("Channels", language: self.language), plugin.channelIds.sorted()),
            (macLocalized("Text Providers", language: self.language), plugin.providerIds.sorted()),
            (macLocalized("Speech Providers", language: self.language), plugin.speechProviderIds.sorted()),
            (macLocalized("Media Understanding", language: self.language), plugin.mediaUnderstandingProviderIds.sorted()),
            (macLocalized("Image Generation", language: self.language), plugin.imageGenerationProviderIds.sorted()),
            (macLocalized("Web Search", language: self.language), plugin.webSearchProviderIds.sorted()),
            (macLocalized("Bundle Capabilities", language: self.language), (plugin.bundleCapabilities ?? []).sorted()),
            (macLocalized("Commands", language: self.language), plugin.commands.sorted()),
            (macLocalized("CLI Commands", language: self.language), plugin.cliCommands.sorted()),
            (macLocalized("Gateway Methods", language: self.language), plugin.gatewayMethods.sorted()),
            (macLocalized("Services", language: self.language), plugin.services.sorted()),
            (macLocalized("Tools", language: self.language), plugin.toolNames.sorted()),
        ]
            .filter { !$0.1.isEmpty }
    }

    private func ensureSelection() {
        guard !self.model.plugins.isEmpty else {
            self.selectedPluginId = nil
            return
        }
        if let selectedPluginId,
           self.model.plugins.contains(where: { $0.id == selectedPluginId })
        {
            return
        }
        self.selectedPluginId = self.model.plugins[0].id
    }
}

@MainActor
@Observable
final class PluginsSettingsModel {
    var workspaceDir: String?
    var plugins: [PluginStatusRecord] = []
    var diagnostics: [PluginDiagnosticRecord] = []
    var isLoading = false
    var error: String?

    var loadedCount: Int {
        self.plugins.filter { $0.status == "loaded" }.count
    }

    func refresh() async {
        guard !self.isLoading else { return }
        self.isLoading = true
        self.error = nil
        do {
            let report = try await GatewayConnection.shared.pluginsStatus()
            self.workspaceDir = report.workspaceDir
            self.diagnostics = report.diagnostics.sorted { lhs, rhs in
                lhs.message.localizedCaseInsensitiveCompare(rhs.message) == .orderedAscending
            }
            self.plugins = report.plugins.sorted { lhs, rhs in
                if lhs.statusSortRank != rhs.statusSortRank {
                    return lhs.statusSortRank < rhs.statusSortRank
                }
                return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
            }
        } catch {
            self.error = error.localizedDescription
            self.plugins = []
            self.diagnostics = []
            self.workspaceDir = nil
        }
        self.isLoading = false
    }

    func diagnostics(for pluginId: String) -> [PluginDiagnosticRecord] {
        self.diagnostics.filter { $0.pluginId == pluginId }
    }

    static func previewModel() -> PluginsSettingsModel {
        let model = PluginsSettingsModel()
        model.workspaceDir = "/tmp/maumau"
        model.plugins = [
            PluginStatusRecord(
                id: "nemoclaw",
                name: "nemoclaw",
                version: "2026.3.27",
                description: "Built-in runtime helpers for Maumau.",
                format: "maumau",
                bundleFormat: nil,
                bundleCapabilities: nil,
                kind: nil,
                source: "/tmp/maumau/extensions/nemoclaw",
                origin: "bundled",
                workspaceDir: "/tmp/maumau",
                enabled: true,
                status: "loaded",
                error: nil,
                toolNames: [],
                hookNames: [],
                channelIds: [],
                providerIds: [],
                speechProviderIds: [],
                mediaUnderstandingProviderIds: [],
                imageGenerationProviderIds: [],
                webSearchProviderIds: [],
                gatewayMethods: [],
                cliCommands: [],
                services: [],
                commands: [],
                httpRoutes: 0,
                hookCount: 0,
                configSchema: false),
            PluginStatusRecord(
                id: "acpx",
                name: "acpx",
                version: "2026.3.27",
                description: "ACP router and coding helpers.",
                format: "maumau",
                bundleFormat: nil,
                bundleCapabilities: ["coding"],
                kind: nil,
                source: "/tmp/maumau/extensions/acpx",
                origin: "bundled",
                workspaceDir: "/tmp/maumau",
                enabled: false,
                status: "disabled",
                error: nil,
                toolNames: ["edit", "read"],
                hookNames: [],
                channelIds: [],
                providerIds: [],
                speechProviderIds: [],
                mediaUnderstandingProviderIds: [],
                imageGenerationProviderIds: [],
                webSearchProviderIds: [],
                gatewayMethods: [],
                cliCommands: [],
                services: [],
                commands: ["acp"],
                httpRoutes: 0,
                hookCount: 0,
                configSchema: true),
            PluginStatusRecord(
                id: "broken-plugin",
                name: "Broken Plugin",
                version: nil,
                description: "Example failing plugin.",
                format: "maumau",
                bundleFormat: nil,
                bundleCapabilities: nil,
                kind: nil,
                source: "/tmp/maumau/extensions/broken-plugin",
                origin: "workspace",
                workspaceDir: "/tmp/maumau",
                enabled: true,
                status: "error",
                error: "Failed to load plugin entrypoint",
                toolNames: [],
                hookNames: [],
                channelIds: [],
                providerIds: [],
                speechProviderIds: [],
                mediaUnderstandingProviderIds: [],
                imageGenerationProviderIds: [],
                webSearchProviderIds: [],
                gatewayMethods: [],
                cliCommands: [],
                services: [],
                commands: [],
                httpRoutes: 0,
                hookCount: 0,
                configSchema: false),
        ]
        model.diagnostics = [
            PluginDiagnosticRecord(
                level: "warn",
                message: "Bundle manifest uses legacy metadata.",
                pluginId: "acpx",
                source: "/tmp/maumau/extensions/acpx/maumau.plugin.json"),
        ]
        return model
    }
}

#if DEBUG
struct PluginsSettings_Previews: PreviewProvider {
    static var previews: some View {
        PluginsSettings(model: PluginsSettingsModel.previewModel())
            .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
    }
}
#endif
