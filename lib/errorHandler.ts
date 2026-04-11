import { logError } from "./logger";
import { normalizeErrorMessage } from "./utils";

export function handleError(error: unknown, context = "global"): string {
  logError(error, context);
  return normalizeErrorMessage(error);
}
