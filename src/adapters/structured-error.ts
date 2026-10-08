/** A complete but invalid structured result; available for local failure audit. */
export class StructuredOutputError extends Error {
  constructor(readonly raw: unknown, options: ErrorOptions) {
    super('模型结构化输出未通过业务 Schema 校验。', options)
    this.name = 'StructuredOutputError'
  }
}
