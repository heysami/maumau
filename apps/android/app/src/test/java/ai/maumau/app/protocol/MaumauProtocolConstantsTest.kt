package ai.maumau.app.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class MaumauProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", MaumauCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", MaumauCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", MaumauCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", MaumauCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", MaumauCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", MaumauCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", MaumauCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", MaumauCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", MaumauCapability.Canvas.rawValue)
    assertEquals("camera", MaumauCapability.Camera.rawValue)
    assertEquals("voiceWake", MaumauCapability.VoiceWake.rawValue)
    assertEquals("location", MaumauCapability.Location.rawValue)
    assertEquals("sms", MaumauCapability.Sms.rawValue)
    assertEquals("device", MaumauCapability.Device.rawValue)
    assertEquals("notifications", MaumauCapability.Notifications.rawValue)
    assertEquals("system", MaumauCapability.System.rawValue)
    assertEquals("photos", MaumauCapability.Photos.rawValue)
    assertEquals("contacts", MaumauCapability.Contacts.rawValue)
    assertEquals("calendar", MaumauCapability.Calendar.rawValue)
    assertEquals("motion", MaumauCapability.Motion.rawValue)
    assertEquals("callLog", MaumauCapability.CallLog.rawValue)
  }

  @Test
  fun cameraCommandsUseStableStrings() {
    assertEquals("camera.list", MaumauCameraCommand.List.rawValue)
    assertEquals("camera.snap", MaumauCameraCommand.Snap.rawValue)
    assertEquals("camera.clip", MaumauCameraCommand.Clip.rawValue)
  }

  @Test
  fun notificationsCommandsUseStableStrings() {
    assertEquals("notifications.list", MaumauNotificationsCommand.List.rawValue)
    assertEquals("notifications.actions", MaumauNotificationsCommand.Actions.rawValue)
  }

  @Test
  fun deviceCommandsUseStableStrings() {
    assertEquals("device.status", MaumauDeviceCommand.Status.rawValue)
    assertEquals("device.info", MaumauDeviceCommand.Info.rawValue)
    assertEquals("device.permissions", MaumauDeviceCommand.Permissions.rawValue)
    assertEquals("device.health", MaumauDeviceCommand.Health.rawValue)
  }

  @Test
  fun systemCommandsUseStableStrings() {
    assertEquals("system.notify", MaumauSystemCommand.Notify.rawValue)
  }

  @Test
  fun photosCommandsUseStableStrings() {
    assertEquals("photos.latest", MaumauPhotosCommand.Latest.rawValue)
  }

  @Test
  fun contactsCommandsUseStableStrings() {
    assertEquals("contacts.search", MaumauContactsCommand.Search.rawValue)
    assertEquals("contacts.add", MaumauContactsCommand.Add.rawValue)
  }

  @Test
  fun calendarCommandsUseStableStrings() {
    assertEquals("calendar.events", MaumauCalendarCommand.Events.rawValue)
    assertEquals("calendar.add", MaumauCalendarCommand.Add.rawValue)
  }

  @Test
  fun motionCommandsUseStableStrings() {
    assertEquals("motion.activity", MaumauMotionCommand.Activity.rawValue)
    assertEquals("motion.pedometer", MaumauMotionCommand.Pedometer.rawValue)
  }

  @Test
  fun callLogCommandsUseStableStrings() {
    assertEquals("callLog.search", MaumauCallLogCommand.Search.rawValue)
  }

  @Test
  fun smsCommandsUseStableStrings() {
    assertEquals("sms.search", MaumauSmsCommand.Search.rawValue)
  }
}
