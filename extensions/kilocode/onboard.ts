import { KILOCODE_BASE_URL, KILOCODE_DEFAULT_MODEL_REF } from "maumau/plugin-sdk/provider-models";
import {
  createModelCatalogPresetAppliers,
  type MaumauConfig,
} from "maumau/plugin-sdk/provider-onboard";
import { buildKilocodeProvider } from "./provider-catalog.js";

export { KILOCODE_BASE_URL, KILOCODE_DEFAULT_MODEL_REF };

const kilocodePresetAppliers = createModelCatalogPresetAppliers({
  primaryModelRef: KILOCODE_DEFAULT_MODEL_REF,
  resolveParams: (_cfg: MaumauConfig) => ({
    providerId: "kilocode",
    api: "openai-completions",
    baseUrl: KILOCODE_BASE_URL,
    catalogModels: buildKilocodeProvider().models ?? [],
    aliases: [{ modelRef: KILOCODE_DEFAULT_MODEL_REF, alias: "Kilo Gateway" }],
  }),
});

export function applyKilocodeProviderConfig(cfg: MaumauConfig): MaumauConfig {
  return kilocodePresetAppliers.applyProviderConfig(cfg);
}

export function applyKilocodeConfig(cfg: MaumauConfig): MaumauConfig {
  return kilocodePresetAppliers.applyConfig(cfg);
}
