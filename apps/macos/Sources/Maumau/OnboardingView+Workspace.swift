import Foundation

extension OnboardingView {
    func loadWorkspaceDefaults(force: Bool = false) async {
        guard force || self.workspacePath.isEmpty else { return }
        let configured = await self.loadAgentWorkspace()
        let url = AgentWorkspace.resolveWorkspaceURL(from: configured)
        self.workspacePath = AgentWorkspace.displayPath(for: url)
        self.refreshBootstrapStatus()
    }

    var localWorkspaceSafetyMessage: String? {
        guard self.state.connectionMode == .local else { return nil }
        let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
        return AgentWorkspace.bootstrapSafety(for: url).unsafeReason
    }

    func refreshBootstrapStatus() {
        let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
        self.needsBootstrap = AgentWorkspace.needsBootstrap(workspaceURL: url)
        if self.needsBootstrap {
            self.didAutoKickoff = false
        }
    }

    var workspaceBootstrapCommand: String {
        let target = self.workspaceShellPathExpression()
        let template = AgentWorkspace.defaultTemplate().trimmingCharacters(in: .whitespacesAndNewlines)
        return """
        mkdir -p \(target)
        cat > \(target)/AGENTS.md <<'EOF'
        \(template)
        EOF
        """
    }

    func applyWorkspace() async {
        guard !self.workspaceApplying else { return }
        self.workspaceApplying = true
        defer { self.workspaceApplying = false }

        do {
            let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
            if let reason = AgentWorkspace.bootstrapSafety(for: url).unsafeReason {
                self.workspaceStatus = "Workspace not created: \(reason)"
                return
            }
            _ = try AgentWorkspace.bootstrap(workspaceURL: url)
            self.workspacePath = AgentWorkspace.displayPath(for: url)
            self.workspaceStatus = "Workspace ready at \(self.workspacePath)"
            _ = await self.saveAgentWorkspace(self.workspacePath)
            self.refreshBootstrapStatus()
        } catch {
            self.workspaceStatus = "Failed to create workspace: \(error.localizedDescription)"
        }
    }

    private func loadAgentWorkspace() async -> String? {
        let root = await ConfigStore.load()
        return AgentWorkspaceConfig.workspace(from: root)
    }

    @discardableResult
    func saveAgentWorkspace(_ workspace: String?) async -> Bool {
        let (success, errorMessage) = await OnboardingView.buildAndSaveWorkspace(workspace)

        if let errorMessage {
            self.workspaceStatus = errorMessage
        }
        return success
    }

    @MainActor
    private static func buildAndSaveWorkspace(_ workspace: String?) async -> (Bool, String?) {
        var root = await ConfigStore.load()
        AgentWorkspaceConfig.setWorkspace(in: &root, workspace: workspace)
        do {
            try await ConfigStore.save(root)
            return (true, nil)
        } catch {
            let errorMessage = "Failed to save config: \(error.localizedDescription)"
            return (false, errorMessage)
        }
    }

    private func workspaceShellPathExpression() -> String {
        let trimmed = self.workspacePath.trimmingCharacters(in: .whitespacesAndNewlines)
        let path = trimmed.isEmpty ? "~/.maumau/workspace" : trimmed
        if path == "~" {
            return "$HOME"
        }
        if path.hasPrefix("~/") {
            let suffix = String(path.dropFirst(2))
            return suffix.isEmpty ? "$HOME" : "$HOME/" + self.shellEscape(suffix)
        }
        return self.shellEscape(path)
    }

    private func shellEscape(_ raw: String) -> String {
        "'" + raw.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
