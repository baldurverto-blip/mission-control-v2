import { join } from "path";
import { stat } from "fs/promises";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
export const MOBILE_FACTORY = join(HOME, "verto-workspace/ops/factory");
export const SAAS_FACTORY = join(HOME, "verto-workspace/ops/saas-factory");
export const FACTORY_CONFIG = join(MOBILE_FACTORY, "factory-config.json");

/**
 * Resolve the factory directory for a given project slug.
 * Checks saas-factory first, then mobile factory.
 */
export async function resolveFactoryDir(slug: string): Promise<string> {
  for (const dir of [SAAS_FACTORY, MOBILE_FACTORY]) {
    try {
      await stat(join(dir, slug, "state.json"));
      return dir;
    } catch { /* not here */ }
  }
  return MOBILE_FACTORY; // fallback
}
