/** Error carrying an HTTP status; the app error handler turns it into a JSON response. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Reads a single string query value (Express may give arrays for repeated keys). */
export const queryString = (value) => (Array.isArray(value) ? value[0] : value ?? "").toString().trim();

export const isNonEmptyString = (v, min = 1, max = 2000) =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max;

export const isHttpUrl = (v) => {
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};
