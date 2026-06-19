export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function estimateRequestTokens(message: string, responseText: string, pipelineType?: string): number {
  const inputTokens = estimateTokens(message)
  const outputTokens = estimateTokens(responseText)

  if (pipelineType === 'build') {
    return inputTokens + outputTokens * 2
  }

  return inputTokens + outputTokens
}
