import type { MaumauConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: MaumauConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
