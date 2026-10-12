import { MarketPilotError } from '../domain/common.ts'
import type { HumanGate } from '../adapters/contracts.ts'
import type { ProjectRepository } from '../storage/repository.ts'
import { ProjectService, ServiceContext } from './project.ts'
import type { Clock } from './project.ts'
import { DocumentService, CompetitorService, PolicyService, AlternativeService } from './records.ts'
import { RequirementService } from './requirement.ts'
import { EvidenceService } from './evidence.ts'
import { DecisionService } from './decision.ts'
import { TenderService } from './tender.ts'
import { ArtifactService } from './artifact.ts'
import { WorkflowService } from './workflow.ts'
import { GenerationService } from './generation.ts'
import { ResearchService } from './research.ts'
import { createV4Services } from './v4/index.ts'

const unavailableHumanGate: HumanGate = {
  async review() { throw new MarketPilotError('HUMAN_GATE_UNAVAILABLE', '尚未连接人工审核入口，不能自动确认。') },
}

/** One owned service family per repository; no global mutable singleton. */
export function createServices(repository: ProjectRepository, humanGate: HumanGate = unavailableHumanGate, clock?: Clock) {
  const ctx = new ServiceContext(repository, humanGate, clock)
  const decisions = new DecisionService(ctx)
  return { projects: new ProjectService(ctx), documents: new DocumentService(ctx), requirements: new RequirementService(ctx),
    evidence: new EvidenceService(ctx), competitors: new CompetitorService(ctx), policies: new PolicyService(ctx),
    alternatives: new AlternativeService(ctx), decisions, tender: new TenderService(ctx),
    artifacts: new ArtifactService(ctx), workflows: new WorkflowService(ctx), generation: new GenerationService(ctx), research: new ResearchService(ctx),
    v4: createV4Services(ctx, decisions) }
}
