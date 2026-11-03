import { invoke } from "@tauri-apps/api/core";

export const skillsApi = {
  save: (name: string, content: string) => invoke<string>("save_user_skill", { name, content }),
};
