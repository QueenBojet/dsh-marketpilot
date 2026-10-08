import type { Context } from '@deepseek-ai/cordis'
import { MarketPilotService } from './service.ts'
import type { Config } from './service.ts'
import { WorkbenchManager } from './workbench.ts'
import { mountWorkbenchRoutes } from './routes.ts'
import { registerProjectTools } from '../tools/project.ts'
import { registerEvidenceTools } from '../tools/evidence.ts'
import { registerArtifactTools } from '../tools/artifact.ts'
import { registerGenerationTools } from '../tools/generation.ts'
import { registerTenderTools } from '../tools/tender.ts'
import { registerResearchTools, researchSearchPlugin } from '../tools/research.ts'

export { Config } from './service.ts'
export { WorkbenchManager } from './workbench.ts'
export const name = 'marketpilot'
export const inject = ['storageDomain', 'tools', 'fs', 'userQuestions']

/** A parent fiber owns both the service family and each Tool registration. */
export async function apply(ctx: Context, config: Config) {
  await ctx.plugin(MarketPilotService, config)
  await ctx.plugin({ name: 'marketpilot-tools', inject: ['marketpilot', 'tools', 'fs'], apply(toolCtx: Context) {
    registerProjectTools(toolCtx)
    registerEvidenceTools(toolCtx)
    registerArtifactTools(toolCtx)
    registerGenerationTools(toolCtx)
    registerTenderTools(toolCtx)
    registerResearchTools(toolCtx)
  } })
  ctx.plugin(researchSearchPlugin)
  // Click-driven workbench: mounts HTTP routes only where a webServer exists.
  const workbench = new WorkbenchManager(ctx)
  mountWorkbenchRoutes(ctx, workbench)
}
