const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|these)\s+(instructions|rules|prompts)/i,
  /disregard\s+(previous|all|these)\s+(instructions|rules)/i,
  /you\s+are\s+(now|no longer|actually)/i,
  /forget\s+(your|all)\s+(instructions|rules|previous)/i,
  /system\s*prompt/i,
  /override\s+(your|the)\s+(instructions|rules|role)/i,
  /new\s+instructions?\s*:/i,
  /\[system\]/i,
  /\[\/system\]/i,
  /<system>/i,
  /<\/system>/i,
  /act\s+as\s+/i,
  /pretend\s+(you|to)\s+be/i,
  /you\s+are\s+now\s+(a|an|the)/i,
  /bypass\s+(your|the)\s+(rules|restrictions|safety)/i,
  /disable\s+(your|the)\s+(safety|rules|filters)/i,
  /show\s+(me|your)\s+(prompt|instructions|config)/i,
  /reveal\s+(your|the)\s+(system|internal)\s+(prompt|config)/i,
  /print\s+(your|the)\s+(prompt|instructions)/i,
  /what\s+(are|is)\s+(your|the)\s+(rules|instructions|prompt)/i,
]

const SENSITIVE_PATTERNS = [
  /(sk-[a-zA-Z0-9]{20,})/,
  /(ghp_[a-zA-Z0-9]{36})/,
  /(gho_[a-zA-Z0-9]{36})/,
  /(xox[baprs]-[a-zA-Z0-9-]+)/,
  /(AIza[a-zA-Z0-9_-]{35})/,
  /(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/,
  /password\s*[:=]\s*\S+/i,
  /secret\s*[:=]\s*\S+/i,
  /token\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
]

export function sanitizeInput(text: string): { safe: boolean; reason?: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: 'Potential prompt injection detected' }
    }
  }

  return { safe: true }
}

export function sanitizeOutput(text: string): string {
  let sanitized = text

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }

  return sanitized
}
