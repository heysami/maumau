import { isNixMode } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import type { RuntimeEnv } from "../runtime.js";

export async function uninstallGatewayServiceIfPresent(
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean },
): Promise<boolean> {
  if (isNixMode) {
    runtime.error("Nix mode detected; service uninstall is disabled.");
    return false;
  }

  if (opts?.dryRun) {
    runtime.log("[dry-run] uninstall gateway service");
    return true;
  }

  const service = resolveGatewayService();
  let loaded = false;
  try {
    loaded = await service.isLoaded({ env: process.env });
  } catch (err) {
    runtime.error(`Gateway service check failed: ${String(err)}`);
    return false;
  }

  if (!loaded) {
    runtime.log(`Gateway service ${service.notLoadedText}.`);
    return true;
  }

  try {
    await service.stop({ env: process.env, stdout: process.stdout });
  } catch (err) {
    runtime.error(`Gateway stop failed: ${String(err)}`);
  }

  try {
    await service.uninstall({ env: process.env, stdout: process.stdout });
    return true;
  } catch (err) {
    runtime.error(`Gateway uninstall failed: ${String(err)}`);
    return false;
  }
}
