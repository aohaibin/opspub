import { invoke } from "./client";
import type { ModelImportBatchResult, ModelPreset, ModelProfile, ModelProfileInput, ModelVerifyOutcome, ModelVendor } from "@/types";

export const modelServiceApi = {
  listVendors: () => invoke<ModelVendor[]>("list_model_vendors"),
  getPreset: (key: string) => invoke<ModelPreset | null>("get_model_preset", { key }),
  listProfiles: () => invoke<ModelProfile[]>("list_model_profiles"),
  saveProfile: (input: ModelProfileInput) => invoke<ModelProfile>("save_model_profile", { input }),
  deleteProfile: (id: string) => invoke<void>("delete_model_profile", { id }),
  exportProfile: (id: string) => invoke<string>("export_model_profile", { id }),
  verify: (input: ModelProfileInput) => invoke<ModelVerifyOutcome>("verify_model_service", { input }),
  importProfiles: (text: string) => invoke<ModelImportBatchResult>("import_model_profiles", { text }),
};
