/**
 * Extract a decide() function from LLM response text.
 * Handles various formats: bare function, markdown code blocks, etc.
 */
export function parseDecideCode(response: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = response.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1].trim();
    if (code.includes('function decide')) {
      return code;
    }
  }

  // Try to find bare function declaration
  const funcMatch = response.match(/(function\s+decide\s*\([\s\S]*)/);
  if (funcMatch) {
    let code = funcMatch[1];
    // Find the matching closing brace
    let depth = 0;
    let endIdx = -1;
    for (let i = 0; i < code.length; i++) {
      if (code[i] === '{') depth++;
      if (code[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx > 0) {
      return code.substring(0, endIdx + 1);
    }
  }

  // Try arrow function: const decide = (ctx) => { ... }
  const arrowMatch = response.match(/(const|let|var)\s+decide\s*=\s*([\s\S]*)/);
  if (arrowMatch) {
    let code = arrowMatch[0];
    // Convert to function declaration for consistency
    // Find the end of the arrow function
    let depth = 0;
    let startBrace = code.indexOf('{');
    if (startBrace >= 0) {
      let endIdx = -1;
      for (let i = startBrace; i < code.length; i++) {
        if (code[i] === '{') depth++;
        if (code[i] === '}') {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
      if (endIdx > 0) {
        // Extract the body
        const body = code.substring(startBrace, endIdx + 1);
        const params = code.match(/\(([^)]*)\)/);
        const paramStr = params ? params[1] : 'ctx';
        return `function decide(${paramStr}) ${body}`;
      }
    }
  }

  // Last resort: return the whole response as-is (might work if it's just the function)
  if (response.includes('decide')) {
    return response.trim();
  }

  throw new Error('Could not extract decide() function from LLM response');
}
