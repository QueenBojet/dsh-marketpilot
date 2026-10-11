import { extname, isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-fs'
import { register, projectIdParam, recordIdParam } from './register.ts'
import { ensure } from '../domain/common.ts'

/** Optional host service; retain the calling session's mode and workspace boundary. */
interface ExportSandboxPolicy {
  resolve(request: { session?: NonNullable<ToolRunContext['agent']>['session'] }): NonNullable<Parameters<Context['fs']['writeText']>[4]>
}

export function registerArtifactTools(ctx: Context) {
  register(ctx, 'marketpilot_artifact_list', '列出项目成果与人工审核状态。', {
    projectId: projectIdParam,
  }, async (args, s) => s.artifacts.list(args.projectId))
  register(ctx, 'marketpilot_artifact_export', '人工审核后导出成果；目标必须是新的绝对路径，不覆盖已有文件。', {
    projectId: projectIdParam, artifactId: recordIdParam,
    path: { type: 'string', required: true, description: 'Absolute path to a new .md/.json/.csv file' },
  }, async (args, s, signal, _parser, exec) => {
    ensure(isAbsolute(args.path), 'ABSOLUTE_PATH_REQUIRED', '请提供导出文件的绝对路径。')
    let artifact = s.artifacts.get(args.projectId, args.artifactId)
    const extension = { markdown: '.md', json: '.json', csv: '.csv' }[artifact.format]
    ensure(extname(args.path).toLowerCase() === extension, 'FORMAT_MISMATCH', `成果应导出为 ${extension}。`)
    if (artifact.reviewStatus !== 'approved') artifact = await s.artifacts.approve(args.projectId, args.artifactId)
    signal.throwIfAborted()
    const target = await ctx.fs.resolve(args.path, { signal })
    const policy = ctx.get('sandboxPolicy') as ExportSandboxPolicy | undefined
    const sandboxPolicy = policy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
    const outcome = await ctx.fs.writeText(target, artifact.content, { kind: 'createIfAbsent' }, signal, sandboxPolicy)
    return { artifactId: artifact.id, path: args.path, operation: outcome.operation, review: artifact.review ?? null }
  })
  register(ctx, 'marketpilot_run_summary', '读取 MarketPilot Run Summary：文件、需求、证据、UNKNOWN、成果和耗时。', {
    projectId: projectIdParam,
  }, async (args, s) => s.workflows.summary(args.projectId))
}
