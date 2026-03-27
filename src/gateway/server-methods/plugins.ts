import { buildPluginStatusReport } from "../../plugins/status.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validatePluginsStatusParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const pluginsHandlers: GatewayRequestHandlers = {
  "plugins.status": ({ params, respond }) => {
    if (!validatePluginsStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid plugins.status params: ${formatValidationErrors(validatePluginsStatusParams.errors)}`,
        ),
      );
      return;
    }

    const report = buildPluginStatusReport();
    respond(
      true,
      {
        workspaceDir: report.workspaceDir,
        plugins: report.plugins,
        diagnostics: report.diagnostics,
      },
      undefined,
    );
  },
};
