import { invoke } from "./client";

export const fileApi = {
  writeText: (path: string, content: string) =>
    invoke<void>("write_text_file", { path, content }),
};
