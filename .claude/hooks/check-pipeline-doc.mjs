#!/usr/bin/env node
// PostToolUse hook (Edit|Write): reminds Claude to update PIPELINE.md and the
// Drive doc whenever scripts/generate-post.mjs itself changes.
let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', () => {
  try {
    const { tool_input } = JSON.parse(input)
    const filePath = tool_input?.file_path ?? ''
    if (/generate-post\.mjs$/.test(filePath)) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext:
              'scripts/generate-post.mjs was just modified. Update PIPELINE.md in this repo to reflect the change ' +
              '(architecture, VOBET-diff table, Cloudways-quirks list, or changelog section as applicable), and note ' +
              'that the Drive doc "[BD][M2-개발] OneBetHub 콘텐츠 자동화 파이프라인_v1.0" (in the "SEO - onebethub (Kevin)" ' +
              'folder) should be kept in sync with the same change before ending the turn.',
          },
        })
      )
    }
  } catch {
    // malformed input — say nothing, never block the tool call
  }
})
