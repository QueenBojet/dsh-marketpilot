/** V4 workbench service family; shares the V3.4 context and decision gate. */
import type { DecisionService } from '../decision.ts'
import type { ServiceContext } from '../project.ts'
import { IntakeService } from './intake.ts'
import { ResearchV4Service } from './research.ts'
import { RouteService, SolutionService } from './solution.ts'
import { DocsService } from './docs.ts'
import { BaselineService } from './baseline.ts'
import { DiscoveryService } from './discovery.ts'

export function createV4Services(ctx: ServiceContext, decisions: DecisionService) {
  const intake = new IntakeService(ctx)
  return {
    discovery: new DiscoveryService(ctx),
    intake, research: new ResearchV4Service(ctx), solution: new SolutionService(ctx), route: new RouteService(ctx, decisions),
    docs: new DocsService(ctx), baselines: new BaselineService(ctx),
    /** Settle runs interrupted by a restart, across every project. Returns the number of settled runs. */
    async recoverInterrupted(): Promise<number> {
      let total = 0
      for (const p of ctx.repository.list()) total += await intake.recoverInterrupted(p.project.id)
      return total
    },
  }
}
export type V4Services = ReturnType<typeof createV4Services>
