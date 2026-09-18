#!/usr/bin/env node
/**
 * OneBetHub 라이브 WordPress 읽기 전용 조회 헬퍼.
 * VOBET Magazine의 `ssh vobet-wp "wp ..."` 별칭과 동일한 역할 — onebethub는 비밀번호 인증이라
 * 그런 SSH config 별칭을 못 쓰므로, generate-post.mjs와 같은 SFTP/exec 경로 처리 로직을 재사용하는
 * 최소 wp-cli 실행 스크립트로 대신한다.
 *
 * 사용: node scripts/wp-remote.mjs "post get 11 --fields=ID,post_title,post_status,post_name"
 * (.env를 직접 파싱하므로 `source .env` 없이 그냥 node로 실행 가능)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { NodeSSH } from 'node-ssh'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(__dirname, '..', '.env')

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
}

const WP_PATH = process.env.SSH_WP_PATH ?? '/home/1555616.cloudwaysapps.com/trqundhprt/public_html'
const wpArgs = process.argv.slice(2).join(' ')

if (!wpArgs) {
  console.error('사용법: node scripts/wp-remote.mjs "<wp-cli 하위 명령>"')
  console.error('예: node scripts/wp-remote.mjs "post list --post_status=publish --fields=ID,post_title,post_status"')
  process.exit(1)
}

const ssh = new NodeSSH()
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

// wp-config.php가 상대경로로 wp-salt.php를 불러오므로 cwd를 WP_PATH로 맞춰야 한다(generate-post.mjs와 동일 이유).
const result = await ssh.execCommand(`wp ${wpArgs} --path="${WP_PATH}"`, { cwd: WP_PATH })
if (result.stdout) console.log(result.stdout)
if (result.stderr) console.error(result.stderr)
ssh.dispose()
process.exit(result.code ?? 0)
