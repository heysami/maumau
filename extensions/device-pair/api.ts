export {
  approveDevicePairing,
  clearDeviceBootstrapTokens,
  issueDeviceBootstrapToken,
  PAIRING_SETUP_BOOTSTRAP_PROFILE,
  listDevicePairing,
  revokeDeviceBootstrapToken,
  type DeviceBootstrapProfile,
} from "maumau/plugin-sdk/device-bootstrap";
export { definePluginEntry, type MaumauPluginApi } from "maumau/plugin-sdk/plugin-entry";
export {
  resolveGatewayBindUrl,
  resolveGatewayPort,
  resolveTailnetHostWithRunner,
} from "maumau/plugin-sdk/core";
export {
  resolvePreferredMaumauTmpDir,
  runPluginCommandWithTimeout,
} from "maumau/plugin-sdk/sandbox";
export { renderQrPngBase64 } from "./qr-image.js";
