// One-off deploy script: uploads wp-theme/onebethub/ to the live server
// and activates it, with a pre-flight PHP syntax check and an automatic
// rollback to twentytwentyfive if anything looks broken.
//
// Usage (env vars must already be loaded into the shell — no dotenv wired
// into this project):
//   cd "C:/project/7play-seo/onebethub-blog" && set -a && source .env && set +a && node scripts/_deploy-theme.mjs
//
// No secrets are hardcoded here — everything comes from process.env,
// matching the pattern already used by scripts/generate-post.mjs's
// getSSH()/wpCli().

import { NodeSSH } from 'node-ssh'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const THEME_LOCAL_DIR = path.join(REPO_ROOT, 'wp-theme', 'onebethub')
const THEME_SLUG = 'onebethub'
const FALLBACK_THEME = 'twentytwentyfive'

const WP_PATH = process.env.SSH_WP_PATH
const SITE_URL = process.env.WORDPRESS_URL || 'https://onebethub.com'

if (!WP_PATH) {
  console.error('Missing SSH_WP_PATH env var — did you `source .env`?')
  process.exit(1)
}

let ssh

async function getSSH() {
  if (ssh) return ssh
  ssh = new NodeSSH()
  const auth = process.env.SSH_PRIVATE_KEY
    ? { privateKey: process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n') }
    : { password: process.env.SSH_PASSWORD }
  await ssh.connect({
    host: process.env.SSH_HOST,
    username: process.env.SSH_USER,
    port: parseInt(process.env.SSH_PORT ?? '22'),
    readyTimeout: 30000,
    hostVerifier: () => true,
    ...auth,
  })
  return ssh
}

// IMPORTANT gotcha (see generate-post.mjs's wpCli()): wp-config.php on this
// server does a bare relative require('wp-salt.php'), which only resolves
// if the SSH shell's cwd is the WP root. Every command that touches `wp`
// or PHP includes must pass { cwd: WP_PATH }, not just --path.
async function run(cmd, { allowFail = false } = {}) {
  const client = await getSSH()
  const result = await client.execCommand(cmd, { cwd: WP_PATH })
  if (result.code !== 0 && !allowFail) {
    throw new Error(`Command failed (${result.code}): ${cmd}\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`)
  }
  return result
}

async function wpCli(args, opts) {
  return run(`wp ${args} --path="${WP_PATH}"`, opts)
}

async function revertToFallback(reason) {
  console.error(`\n!!! Reverting to ${FALLBACK_THEME} — reason: ${reason}`)
  try {
    const r = await wpCli(`theme activate ${FALLBACK_THEME} --allow-root`, { allowFail: true })
    console.error('Revert result:', r.stdout || r.stderr)
  } catch (e) {
    console.error('Revert command itself failed:', e.message)
  }
}

async function main() {
  console.log('== OneBetHub theme deploy ==')
  console.log('WP_PATH:', WP_PATH)
  console.log('Local theme dir:', THEME_LOCAL_DIR)

  const client = await getSSH()
  console.log('SSH connected.')

  // 1. Upload theme directory (recursive)
  const remoteThemeDir = `${WP_PATH}/wp-content/themes/${THEME_SLUG}`
  console.log(`Uploading to ${remoteThemeDir} ...`)
  await run(`mkdir -p "${remoteThemeDir}"`)

  // NOTE 1: node-ssh's putDirectory() joins the *remote* path with Node's
  // path.join(), which emits backslashes on Windows and produces bogus
  // SFTP paths (silently failing every file with "Permission denied").
  // Walk the tree ourselves and always join remote paths with
  // path.posix.join so the SFTP side only ever sees forward slashes.
  //
  // NOTE 2 (Cloudways-specific gotcha, discovered by probing sftp.realpath
  // and sftp.readdir directly): the SFTP subsystem on this server is
  // chrooted to the *application* home directory (one level above
  // public_html) — e.g. exec/shell/wp-cli see the absolute path
  // "/home/<id>.cloudwaysapps.com/<app>/public_html/...", but that exact
  // absolute path does NOT exist from the SFTP side. From SFTP, "/" is
  // already the app home, and "public_html" is a plain subdirectory of
  // it. So every putFile() call below uses a path relative to that SFTP
  // root (`<basename of WP_PATH>/wp-content/themes/...`), while every
  // `wp`/`php -l`/`mkdir` exec command keeps using the full absolute
  // WP_PATH (that side of the connection is a normal, non-chrooted shell).
  const sftpBase = path.posix.basename(WP_PATH.replace(/\/$/, ''))
  const sftpThemeDir = path.posix.join(sftpBase, 'wp-content', 'themes', THEME_SLUG)
  console.log(`(SFTP-relative theme path: ${sftpThemeDir})`)
  const failures = []
  let uploadedCount = 0

  function collectFiles(localDir, relDir = '') {
    const entries = fs.readdirSync(localDir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store') continue
      const localPath = path.join(localDir, entry.name)
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        files.push(...collectFiles(localPath, relPath))
      } else {
        files.push({ localPath, relPath })
      }
    }
    return files
  }

  const allFiles = collectFiles(THEME_LOCAL_DIR)
  const remoteDirsNeeded = new Set()
  for (const f of allFiles) {
    const relDirParts = f.relPath.split('/').slice(0, -1)
    for (let i = 1; i <= relDirParts.length; i++) {
      remoteDirsNeeded.add(relDirParts.slice(0, i).join('/'))
    }
  }
  for (const relDir of remoteDirsNeeded) {
    await run(`mkdir -p "${path.posix.join(remoteThemeDir, relDir)}"`)
  }

  for (const f of allFiles) {
    const sftpPath = path.posix.join(sftpThemeDir, f.relPath) // SFTP-chroot-relative — see NOTE 2 above
    const remotePath = path.posix.join(remoteThemeDir, f.relPath) // absolute, for logging / exec-side reference only
    try {
      await client.putFile(f.localPath, sftpPath)
      uploadedCount++
      console.log('  uploaded:', remotePath)
    } catch (e) {
      failures.push({ remotePath, error: e.message || String(e) })
    }
  }

  if (failures.length) {
    console.error('Upload failures:')
    for (const f of failures) console.error(' -', f.remotePath, ':', f.error)
    process.exit(1)
  }
  console.log(`Upload complete. ${uploadedCount} file(s) uploaded.`)

  // 2. Pre-flight PHP syntax check on every uploaded .php file — do this
  //    BEFORE activating so a typo never takes the live site down.
  console.log('Running php -l syntax check on all theme PHP files ...')
  const lintResult = await run(
    `find "${remoteThemeDir}" -name "*.php" -exec php -l {} \\;`,
    { allowFail: true }
  )
  const lintOutput = lintResult.stdout + '\n' + lintResult.stderr
  console.log(lintOutput.trim())
  if (/Parse error|Errors parsing/i.test(lintOutput)) {
    console.error('PHP syntax errors detected in the uploaded theme — aborting BEFORE activation.')
    console.error('The live site was never touched (old theme still active). Fix the PHP and re-run.')
    process.exit(1)
  }
  console.log('No PHP syntax errors found.')

  // 3. Activate the theme
  console.log(`Activating theme "${THEME_SLUG}" ...`)
  try {
    const activateResult = await wpCli(`theme activate ${THEME_SLUG} --allow-root`)
    console.log(activateResult.stdout)
  } catch (e) {
    console.error('Theme activation command failed:', e.message)
    await revertToFallback('wp theme activate returned non-zero / threw')
    process.exit(1)
  }

  // 4. Verify it's active
  const listResult = await wpCli(`theme list --allow-root --format=json`)
  let themes
  try {
    themes = JSON.parse(listResult.stdout)
  } catch {
    console.error('Could not parse `wp theme list` JSON output:', listResult.stdout)
    await revertToFallback('unparsable wp theme list output')
    process.exit(1)
  }
  const onebethub = themes.find((t) => t.name === THEME_SLUG)
  if (!onebethub || onebethub.status !== 'active') {
    console.error('Theme did not report as active after activation:', JSON.stringify(onebethub))
    await revertToFallback('theme not active per `wp theme list`')
    process.exit(1)
  }
  console.log(`Confirmed active: ${THEME_SLUG} (status=${onebethub.status})`)

  // 5. Live HTTP check
  console.log(`Checking ${SITE_URL} ...`)
  let httpOk = false
  let httpStatus = null
  try {
    const resp = await fetch(SITE_URL, { redirect: 'follow' })
    httpStatus = resp.status
    httpOk = resp.status === 200
    // Also grab a small slice of the body to sanity-check it's not a fatal-error page.
    const bodyText = await resp.text()
    const looksLikeFatal = /Fatal error|Parse error|<b>Warning<\/b>/i.test(bodyText)
    console.log(`HTTP ${httpStatus}, body length ${bodyText.length}, looksLikeFatal=${looksLikeFatal}`)
    if (looksLikeFatal) {
      httpOk = false
    }
  } catch (e) {
    console.error('HTTP check failed:', e.message)
  }

  if (!httpOk) {
    console.error(`Live homepage check failed (status=${httpStatus}).`)
    await revertToFallback(`homepage did not return a clean 200 (got ${httpStatus})`)
    process.exit(1)
  }

  console.log(`\n✅ Deploy succeeded. ${SITE_URL} returned HTTP ${httpStatus} with the "${THEME_SLUG}" theme active.`)
}

main()
  .catch(async (e) => {
    console.error('Unexpected error during deploy:', e)
    try {
      await revertToFallback('unexpected exception during deploy script')
    } catch {}
    process.exitCode = 1
  })
  .finally(() => {
    if (ssh) ssh.dispose()
  })
