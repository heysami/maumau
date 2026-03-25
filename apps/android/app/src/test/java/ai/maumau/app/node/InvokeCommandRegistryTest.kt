package ai.maumau.app.node

import ai.maumau.app.protocol.MaumauCalendarCommand
import ai.maumau.app.protocol.MaumauCameraCommand
import ai.maumau.app.protocol.MaumauCallLogCommand
import ai.maumau.app.protocol.MaumauCapability
import ai.maumau.app.protocol.MaumauContactsCommand
import ai.maumau.app.protocol.MaumauDeviceCommand
import ai.maumau.app.protocol.MaumauLocationCommand
import ai.maumau.app.protocol.MaumauMotionCommand
import ai.maumau.app.protocol.MaumauNotificationsCommand
import ai.maumau.app.protocol.MaumauPhotosCommand
import ai.maumau.app.protocol.MaumauSmsCommand
import ai.maumau.app.protocol.MaumauSystemCommand
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InvokeCommandRegistryTest {
  private val coreCapabilities =
    setOf(
      MaumauCapability.Canvas.rawValue,
      MaumauCapability.Device.rawValue,
      MaumauCapability.Notifications.rawValue,
      MaumauCapability.System.rawValue,
      MaumauCapability.Photos.rawValue,
      MaumauCapability.Contacts.rawValue,
      MaumauCapability.Calendar.rawValue,
    )

  private val optionalCapabilities =
    setOf(
      MaumauCapability.Camera.rawValue,
      MaumauCapability.Location.rawValue,
      MaumauCapability.Sms.rawValue,
      MaumauCapability.CallLog.rawValue,
      MaumauCapability.VoiceWake.rawValue,
      MaumauCapability.Motion.rawValue,
    )

  private val coreCommands =
    setOf(
      MaumauDeviceCommand.Status.rawValue,
      MaumauDeviceCommand.Info.rawValue,
      MaumauDeviceCommand.Permissions.rawValue,
      MaumauDeviceCommand.Health.rawValue,
      MaumauNotificationsCommand.List.rawValue,
      MaumauNotificationsCommand.Actions.rawValue,
      MaumauSystemCommand.Notify.rawValue,
      MaumauPhotosCommand.Latest.rawValue,
      MaumauContactsCommand.Search.rawValue,
      MaumauContactsCommand.Add.rawValue,
      MaumauCalendarCommand.Events.rawValue,
      MaumauCalendarCommand.Add.rawValue,
    )

  private val optionalCommands =
    setOf(
      MaumauCameraCommand.Snap.rawValue,
      MaumauCameraCommand.Clip.rawValue,
      MaumauCameraCommand.List.rawValue,
      MaumauLocationCommand.Get.rawValue,
      MaumauMotionCommand.Activity.rawValue,
      MaumauMotionCommand.Pedometer.rawValue,
      MaumauSmsCommand.Send.rawValue,
      MaumauSmsCommand.Search.rawValue,
      MaumauCallLogCommand.Search.rawValue,
    )

  private val debugCommands = setOf("debug.logs", "debug.ed25519")

  @Test
  fun advertisedCapabilities_respectsFeatureAvailability() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags())

    assertContainsAll(capabilities, coreCapabilities)
    assertMissingAll(capabilities, optionalCapabilities)
  }

  @Test
  fun advertisedCapabilities_includesFeatureCapabilitiesWhenEnabled() {
    val capabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          callLogAvailable = true,
          voiceWakeEnabled = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
        ),
      )

    assertContainsAll(capabilities, coreCapabilities + optionalCapabilities)
  }

  @Test
  fun advertisedCommands_respectsFeatureAvailability() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags())

    assertContainsAll(commands, coreCommands)
    assertMissingAll(commands, optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_includesFeatureCommandsWhenEnabled() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(
          cameraEnabled = true,
          locationEnabled = true,
          sendSmsAvailable = true,
          readSmsAvailable = true,
          callLogAvailable = true,
          motionActivityAvailable = true,
          motionPedometerAvailable = true,
          debugBuild = true,
        ),
      )

    assertContainsAll(commands, coreCommands + optionalCommands + debugCommands)
  }

  @Test
  fun advertisedCommands_onlyIncludesSupportedMotionCommands() {
    val commands =
      InvokeCommandRegistry.advertisedCommands(
        NodeRuntimeFlags(
          cameraEnabled = false,
          locationEnabled = false,
          sendSmsAvailable = false,
          readSmsAvailable = false,
          callLogAvailable = false,
          voiceWakeEnabled = false,
          motionActivityAvailable = true,
          motionPedometerAvailable = false,
          debugBuild = false,
        ),
      )

    assertTrue(commands.contains(MaumauMotionCommand.Activity.rawValue))
    assertFalse(commands.contains(MaumauMotionCommand.Pedometer.rawValue))
  }

  @Test
  fun advertisedCommands_splitsSmsSendAndSearchAvailability() {
    val readOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCommands =
      InvokeCommandRegistry.advertisedCommands(
        defaultFlags(sendSmsAvailable = true),
      )

    assertTrue(readOnlyCommands.contains(MaumauSmsCommand.Search.rawValue))
    assertFalse(readOnlyCommands.contains(MaumauSmsCommand.Send.rawValue))
    assertTrue(sendOnlyCommands.contains(MaumauSmsCommand.Send.rawValue))
    assertFalse(sendOnlyCommands.contains(MaumauSmsCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_includeSmsWhenEitherSmsPathIsAvailable() {
    val readOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(readSmsAvailable = true),
      )
    val sendOnlyCapabilities =
      InvokeCommandRegistry.advertisedCapabilities(
        defaultFlags(sendSmsAvailable = true),
      )

    assertTrue(readOnlyCapabilities.contains(MaumauCapability.Sms.rawValue))
    assertTrue(sendOnlyCapabilities.contains(MaumauCapability.Sms.rawValue))
  }

  @Test
  fun advertisedCommands_excludesCallLogWhenUnavailable() {
    val commands = InvokeCommandRegistry.advertisedCommands(defaultFlags(callLogAvailable = false))

    assertFalse(commands.contains(MaumauCallLogCommand.Search.rawValue))
  }

  @Test
  fun advertisedCapabilities_excludesCallLogWhenUnavailable() {
    val capabilities = InvokeCommandRegistry.advertisedCapabilities(defaultFlags(callLogAvailable = false))

    assertFalse(capabilities.contains(MaumauCapability.CallLog.rawValue))
  }

  private fun defaultFlags(
    cameraEnabled: Boolean = false,
    locationEnabled: Boolean = false,
    sendSmsAvailable: Boolean = false,
    readSmsAvailable: Boolean = false,
    callLogAvailable: Boolean = false,
    voiceWakeEnabled: Boolean = false,
    motionActivityAvailable: Boolean = false,
    motionPedometerAvailable: Boolean = false,
    debugBuild: Boolean = false,
  ): NodeRuntimeFlags =
    NodeRuntimeFlags(
      cameraEnabled = cameraEnabled,
      locationEnabled = locationEnabled,
      sendSmsAvailable = sendSmsAvailable,
      readSmsAvailable = readSmsAvailable,
      callLogAvailable = callLogAvailable,
      voiceWakeEnabled = voiceWakeEnabled,
      motionActivityAvailable = motionActivityAvailable,
      motionPedometerAvailable = motionPedometerAvailable,
      debugBuild = debugBuild,
    )

  private fun assertContainsAll(actual: List<String>, expected: Set<String>) {
    expected.forEach { value -> assertTrue(actual.contains(value)) }
  }

  private fun assertMissingAll(actual: List<String>, forbidden: Set<String>) {
    forbidden.forEach { value -> assertFalse(actual.contains(value)) }
  }
}
