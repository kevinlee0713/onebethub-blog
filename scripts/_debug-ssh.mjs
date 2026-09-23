// 임시 진단 스크립트 — GitHub Actions 러너에서만 재현되는 "cd: ***: No such file or directory"의
// 실제(마스킹 안 된) 원인을 보기 위함. AI API 호출 전혀 없음, 비용 없음. 확인 끝나면 삭제할 것.
import { NodeSSH } from 'node-ssh'
import fs from 'fs'
import path from 'path'
import os from 'os'

async function run() {
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
    keepaliveInterval: 15000,
    keepaliveCountMax: 10,
    ...auth,
  })

  const WP_PATH = process.env.SSH_WP_PATH
  // 시크릿 값 자체는 GH Actions가 로그에서 마스킹하므로, 대신 길이/해시로 로컬에서 본 값과 대조.
  const crypto = await import('crypto')
  const hash = crypto.createHash('sha256').update(WP_PATH).digest('hex').slice(0, 16)
  console.log('WP_PATH length:', WP_PATH.length, 'sha256[:16]:', hash)
  console.log('WP_PATH JSON (char codes for whitespace check):', JSON.stringify(WP_PATH))

  const r0 = await ssh.execCommand('whoami && hostname && pwd')
  console.log('[whoami/hostname/default pwd]', JSON.stringify(r0))

  const r1 = await ssh.execCommand('echo marker-ok', { cwd: WP_PATH })
  console.log('[cwd exec test]', JSON.stringify(r1))

  const r2 = await ssh.execCommand('wp core version', { cwd: WP_PATH })
  console.log('[wp core version via cwd]', JSON.stringify(r2))

  const APP_HOME = path.posix.dirname(WP_PATH)
  const r3 = await ssh.execCommand(`ls -la ${APP_HOME}`)
  console.log('[ls APP_HOME contents]', JSON.stringify(r3))

  ssh.dispose()
}

run().catch(e => { console.error('DEBUG SCRIPT ERROR:', e); process.exit(1) })
