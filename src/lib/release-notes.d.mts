export function summarizeCommits(subjects: readonly string[]): string[];
export function parseReleaseNotes(body: string | null | undefined): string[];
export function formatReleaseNotes(items: readonly string[]): string;
export function formatReleaseDate(value: string | null | undefined): string;
