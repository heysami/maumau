export const MAUMAU_CLI_ENV_VAR = "MAUMAU_CLI";
export const MAUMAU_CLI_ENV_VALUE = "1";

export function markMaumauExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [MAUMAU_CLI_ENV_VAR]: MAUMAU_CLI_ENV_VALUE,
  };
}

export function ensureMaumauExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[MAUMAU_CLI_ENV_VAR] = MAUMAU_CLI_ENV_VALUE;
  return env;
}
