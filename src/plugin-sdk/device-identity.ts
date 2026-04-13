export type { DeviceIdentity } from "../infra/device-identity.js";
export {
  deriveDeviceIdFromPublicKey,
  loadOrCreateDeviceIdentity,
  normalizeDevicePublicKeyBase64Url,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
  verifyDeviceSignature,
} from "../infra/device-identity.js";
