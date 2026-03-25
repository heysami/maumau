export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleMaumauDevices: MatrixManagedDeviceInfo[];
  currentMaumauDevices: MatrixManagedDeviceInfo[];
};

const MAUMAU_DEVICE_NAME_PREFIX = "Maumau ";

export function isMaumauManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(MAUMAU_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const maumauDevices = devices.filter((device) => isMaumauManagedMatrixDevice(device.displayName));
  return {
    currentDeviceId,
    staleMaumauDevices: maumauDevices.filter((device) => !device.current),
    currentMaumauDevices: maumauDevices.filter((device) => device.current),
  };
}
