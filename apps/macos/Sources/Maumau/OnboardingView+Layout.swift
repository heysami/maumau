import AppKit
import SwiftUI

extension OnboardingView {
    private var showsHeaderProgress: Bool {
        self.activePageIndex != self.languagePageIndex &&
            self.activePageIndex != 0 &&
            self.activePageIndex != 9 &&
            !self.progressHeaderSteps.isEmpty
    }

    private var progressHeaderSteps: [(stage: OnboardingHeaderStage, title: String, metaText: String?, pageID: Int)] {
        self.setupStepDefinitions
            .filter { self.pageOrder.contains($0.pageID) }
            .map { ($0.stage, $0.progressTitle, $0.headerMetaText, $0.pageID) }
    }

    private var progressHeaderActiveIndex: Int? {
        self.progressHeaderSteps.firstIndex { $0.pageID == self.activePageIndex }
    }

    private var requiredSetupPageOrderIndex: Int? {
        let shouldLockForRequiredSetup = Self.shouldWaitForLocalSetupBeforeWizard(
            mode: self.state.connectionMode,
            installingCLI: self.installingCLI,
            isCheckingLocalGatewaySetup: self.isCheckingLocalGatewaySetup,
            localGatewaySetupAvailable: self.localGatewaySetupAvailable)
        return self.state.connectionMode == .local && shouldLockForRequiredSetup
            ? self.pageOrder.firstIndex(of: self.connectionPageIndex)
            : nil
    }

    private func navigateToPage(_ index: Int) {
        guard index != self.currentPage else { return }
        let leavingWizard = self.activePageIndex == self.wizardPageIndex
        if leavingWizard, !self.onboardingWizard.isSatisfiedForOnboarding {
            Task {
                await self.onboardingWizard.cancelIfRunning()
                self.onboardingWizard.reset()
            }
        }
        withAnimation {
            self.currentPage = index
        }
    }

    var body: some View {
        GeometryReader { geometry in
            let viewportWidth = max(Self.windowWidth, geometry.size.width)
            let headerHeight = self.showsHeaderProgress ? Self.headerHeight : 0
            let contentHeight = max(
                Self.minimumContentHeight,
                geometry.size.height - headerHeight - Self.navigationHeight)

            VStack(spacing: 0) {
                if self.showsHeaderProgress {
                    OnboardingHeaderHero(
                        steps: self.progressHeaderSteps.enumerated().map { index, step in
                            let targetPageIndex = self.pageOrder.firstIndex(of: step.pageID) ?? 0
                            let isLocked = Self.shouldLockForwardNavigation(
                                currentPage: self.currentPage,
                                targetPage: targetPageIndex,
                                canAdvance: self.canAdvance,
                                requiredSetupPageIndex: self.requiredSetupPageOrderIndex,
                                wizardPageOrderIndex: self.wizardPageOrderIndex,
                                wizardComplete: self.onboardingWizard.isSatisfiedForOnboarding)
                            return OnboardingHeaderHero.StepItem(
                                stage: step.stage,
                                title: step.title,
                                metaText: step.metaText,
                                isActive: self.progressHeaderActiveIndex == index,
                                isComplete: (self.progressHeaderActiveIndex ?? -1) > index,
                                isLocked: isLocked,
                                action: { self.navigateToPage(targetPageIndex) })
                        })
                        .frame(height: Self.headerHeight)
                }

                HStack(spacing: 0) {
                    ForEach(self.pageOrder, id: \.self) { pageIndex in
                        self.pageView(for: pageIndex)
                            .frame(width: viewportWidth)
                            .frame(maxHeight: .infinity, alignment: .top)
                            .clipped()
                    }
                }
                .offset(x: CGFloat(-self.currentPage) * viewportWidth)
                .animation(
                    .interactiveSpring(response: 0.5, dampingFraction: 0.86, blendDuration: 0.25),
                    value: self.currentPage)
                .frame(width: viewportWidth, height: contentHeight, alignment: .topLeading)
                .clipped()

                self.navigationBar
            }
            .frame(width: viewportWidth, height: geometry.size.height, alignment: .top)
            .onAppear {
                self.pageWidth = viewportWidth
            }
            .onChange(of: geometry.size.width) { _, newValue in
                self.pageWidth = max(Self.windowWidth, newValue)
            }
        }
        .frame(minWidth: Self.windowWidth)
        .frame(minHeight: Self.minimumWindowHeight)
        .background(Color(NSColor.windowBackgroundColor))
        .onAppear {
            self.currentPage = Self.initialPageCursor(
                hasSelectedOnboardingLanguage: self.state.hasSelectedOnboardingLanguage,
                onboardingSeen: self.state.onboardingSeen)
            self.maybeDefaultToLocalConnectionMode()
            self.updateMonitoring(for: self.activePageIndex)
        }
        .onChange(of: self.state.onboardingLanguage) { _, newValue in
            guard newValue != nil else { return }
            self.maybeDefaultToLocalConnectionMode()
            self.updateMonitoring(for: self.activePageIndex)
        }
        .onChange(of: self.pageOrder) { oldValue, _ in
            guard !oldValue.isEmpty else { return }
            let clamped = min(max(0, self.currentPage), oldValue.count - 1)
            let previousActivePageIndex = oldValue[clamped]
            self.reconcilePageForModeChange(previousActivePageIndex: previousActivePageIndex)
        }
        .onChange(of: self.currentPage) { _, newValue in
            self.updateMonitoring(for: self.activePageIndex(for: newValue))
        }
        .onChange(of: self.state.connectionMode) { _, _ in
            let oldActive = self.activePageIndex
            self.reconcilePageForModeChange(previousActivePageIndex: oldActive)
            self.resetCLIAutoInstallIfNeeded(for: self.state.connectionMode)
            self.updateDiscoveryMonitoring(for: self.activePageIndex)
            self.maybeAutoInstallCLI(for: self.activePageIndex)
            Task {
                await self.refreshLocalGatewayRuntimeAvailability()
                await self.loadWorkspaceDefaults(force: true)
            }
        }
        .onChange(of: self.needsBootstrap) { _, _ in
            if self.currentPage >= self.pageOrder.count {
                self.currentPage = max(0, self.pageOrder.count - 1)
            }
        }
        .onChange(of: self.onboardingWizard.isSatisfiedForOnboarding) { oldValue, newValue in
            guard !oldValue, newValue, self.activePageIndex == self.wizardPageIndex else { return }
            self.refreshBootstrapStatus()
            guard Self.shouldAutoAdvanceAfterWizardCompletion(
                mode: self.state.connectionMode,
                browserControlEnabled: MaumauConfigFile.browserControlEnabled())
            else {
                return
            }
            self.handleNext()
        }
        .onDisappear {
            self.stopPermissionMonitoring()
            self.stopDiscovery()
            Task { await self.onboardingWizard.cancelIfRunning() }
        }
        .task {
            await self.refreshPerms()
            self.refreshCLIStatus()
            await self.refreshLocalGatewayRuntimeAvailability()
            await self.loadWorkspaceDefaults()
            self.refreshBootstrapStatus()
            self.preferredGatewayID = GatewayDiscoveryPreferences.preferredStableID()
        }
    }

    func activePageIndex(for pageCursor: Int) -> Int {
        guard !self.pageOrder.isEmpty else { return 0 }
        let clamped = min(max(0, pageCursor), self.pageOrder.count - 1)
        return self.pageOrder[clamped]
    }

    func reconcilePageForModeChange(previousActivePageIndex: Int) {
        if let exact = self.pageOrder.firstIndex(of: previousActivePageIndex) {
            withAnimation { self.currentPage = exact }
            return
        }
        if let next = self.pageOrder.firstIndex(where: { $0 > previousActivePageIndex }) {
            withAnimation { self.currentPage = next }
            return
        }
        withAnimation { self.currentPage = max(0, self.pageOrder.count - 1) }
    }

    var navigationBar: some View {
        let wizardLockIndex = self.wizardPageOrderIndex
        let hideBackButton = self.activePageIndex == self.wizardPageIndex && self.onboardingWizard.isBlocking
        let showsWizardFooterControls = self.activePageIndex == self.wizardPageIndex &&
            !self.onboardingWizard.isSatisfiedForOnboarding
        let footerSlotWidth: CGFloat = 120
        let showWizardPrimaryButton = showsWizardFooterControls &&
            !self.onboardingWizard.isSatisfiedForOnboarding &&
            self.onboardingWizard.primaryActionTitle != nil
        return Group {
            if showsWizardFooterControls {
                VStack(spacing: 10) {
                    HStack(alignment: .center, spacing: 12) {
                        HStack(spacing: 12) {
                            Button(
                                self.onboardingWizard.canGoBack
                                    ? self.strings.previousStepButtonTitle
                                    : self.strings.backToWorkspaceButtonTitle)
                            {
                                if self.onboardingWizard.canGoBack {
                                    Task { await self.onboardingWizard.goBackOneStep() }
                                } else {
                                    self.handleBack()
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(
                                self.onboardingWizard.isSubmitting ||
                                    self.onboardingWizard.isRewinding ||
                                    self.onboardingWizard.isShowingProgressStep)

                            Button(self.strings.setUpLaterButtonTitle) {
                                self.skipWizardForLater()
                            }
                            .buttonStyle(.bordered)
                        }
                        .controlSize(.small)

                        Spacer(minLength: 12)

                        if showWizardPrimaryButton,
                           let title = self.onboardingWizard.primaryActionTitle(
                               in: self.state.effectiveOnboardingLanguage)
                        {
                            Button(title) {
                                Task {
                                    await self.onboardingWizard.triggerPrimaryAction(
                                        mode: self.state.connectionMode,
                                        workspace: self.workspacePath.isEmpty ? nil : self.workspacePath)
                                }
                            }
                            .keyboardShortcut(.return)
                            .buttonStyle(.borderedProminent)
                            .disabled(self.onboardingWizard.isPrimaryActionDisabled)
                        } else {
                            Color.clear
                                .frame(minWidth: 88, minHeight: 32)
                        }
                    }

                    self.pageDots(wizardLockIndex: wizardLockIndex)
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 13)
                .frame(minHeight: 86, alignment: .bottom)
            } else {
                VStack(spacing: 8) {
                    if let onboardingFinishStatus = self.onboardingFinishStatus, !onboardingFinishStatus.isEmpty {
                        Text(onboardingFinishStatus)
                            .font(.caption)
                            .foregroundStyle(self.onboardingFinishStatusIsError ? .orange : .secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    HStack(spacing: 20) {
                        ZStack(alignment: .leading) {
                            Button(action: {}, label: {
                                Label(self.strings.backButtonTitle, systemImage: "chevron.left").labelStyle(.iconOnly)
                            })
                            .buttonStyle(.plain)
                            .opacity(0)
                            .disabled(true)

                            if self.currentPage > 0 && !hideBackButton {
                                Button(action: self.handleBack, label: {
                                    Label(self.strings.backButtonTitle, systemImage: "chevron.left")
                                        .labelStyle(.iconOnly)
                                })
                                .buttonStyle(.plain)
                                .foregroundColor(.secondary)
                                .opacity(0.8)
                                .transition(.opacity.combined(with: .scale(scale: 0.9)))
                            }
                        }
                        .frame(width: footerSlotWidth, alignment: .leading)

                        Spacer()

                        self.pageDots(wizardLockIndex: wizardLockIndex)

                        Spacer()

                        Button(action: self.handleNext) {
                            Text(self.buttonTitle)
                                .frame(minWidth: 88)
                        }
                        .keyboardShortcut(.return)
                        .buttonStyle(.borderedProminent)
                        .disabled(!self.canAdvance)
                        .frame(width: footerSlotWidth, alignment: .trailing)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 13)
                .frame(minHeight: 60, alignment: .bottom)
            }
        }
    }

    private func pageDots(wizardLockIndex: Int?) -> some View {
        let requiredSetupPageIndex = self.requiredSetupPageOrderIndex
        return HStack(spacing: 8) {
            ForEach(0..<self.pageCount, id: \.self) { index in
                let isLocked = Self.shouldLockForwardNavigation(
                    currentPage: self.currentPage,
                    targetPage: index,
                    canAdvance: self.canAdvance,
                    requiredSetupPageIndex: requiredSetupPageIndex,
                    wizardPageOrderIndex: wizardLockIndex,
                    wizardComplete: self.onboardingWizard.isSatisfiedForOnboarding)
                Button {
                    withAnimation { self.currentPage = index }
                } label: {
                    Circle()
                        .fill(index == self.currentPage ? Color.accentColor : Color.gray.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
                .buttonStyle(.plain)
                .disabled(isLocked)
                .opacity(isLocked ? 0.3 : 1)
            }
        }
    }

    func onboardingPage(pageID: Int, @ViewBuilder _ content: () -> some View) -> some View {
        let scrollIndicatorGutter: CGFloat = 18
        return ScrollView {
            VStack(spacing: 16) {
                content()
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .top)
            .padding(.trailing, scrollIndicatorGutter)
        }
        .scrollIndicators(.automatic)
        .padding(.horizontal, 28)
        .frame(width: self.pageWidth, alignment: .top)
        .frame(maxHeight: .infinity, alignment: .top)
        .clipped()
        .id("onboarding-scroll-\(pageID)")
    }

    func onboardingCard(
        spacing: CGFloat = 12,
        padding: CGFloat = 16,
        @ViewBuilder _ content: () -> some View) -> some View
    {
        VStack(alignment: .leading, spacing: spacing) {
            content()
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(NSColor.controlBackgroundColor))
                .shadow(color: .black.opacity(0.06), radius: 8, y: 3))
    }

    func onboardingGlassCard(
        spacing: CGFloat = 12,
        padding: CGFloat = 16,
        @ViewBuilder _ content: () -> some View) -> some View
    {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        return VStack(alignment: .leading, spacing: spacing) {
            content()
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.clear)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
    }

    func featureRow(title: String, subtitle: String, systemImage: String) -> some View {
        self.featureRowContent(title: title, subtitle: subtitle, systemImage: systemImage)
    }

    func featureActionRow(
        title: String,
        subtitle: String,
        systemImage: String,
        buttonTitle: String,
        disabled: Bool = false,
        action: @escaping () -> Void) -> some View
    {
        self.featureRowContent(
            title: title,
            subtitle: subtitle,
            systemImage: systemImage,
            action: AnyView(
                Button(buttonTitle, action: action)
                    .buttonStyle(.link)
                    .disabled(disabled)
                    .padding(.top, 2)))
    }

    private func featureRowContent(
        title: String,
        subtitle: String,
        systemImage: String,
        action: AnyView? = nil) -> some View
    {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.accentColor)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let action {
                    action
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}
