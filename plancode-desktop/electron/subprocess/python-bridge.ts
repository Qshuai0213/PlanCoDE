import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function resolveDefaultWorkdir() {
  const projectRoot = path.resolve(__dirname, '..', '..', '..')
  const workDir = path.join(projectRoot, 'work')
  fs.mkdirSync(workDir, { recursive: true })
  return workDir
}

export class PythonBridge extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer = ''
  private pythonExe: string
  private bridgeDir: string
  private workdir: string
  private env: NodeJS.ProcessEnv

  constructor(workdir: string, env: NodeJS.ProcessEnv) {
    super()
    this.workdir = workdir?.trim() ? workdir : resolveDefaultWorkdir()
    this.env = env
    this.pythonExe = process.platform === 'win32' ? 'python' : 'python3'
    this.bridgeDir = path.join(__dirname, '..', '..', 'bridge')
  }

  async start(agentType: string, options: Record<string, any>): Promise<void> {
    const args = [
      path.join(this.bridgeDir, 'runner.py'),
      '--agent', agentType,
      '--workdir', this.workdir,
    ]
    if (options.goal) args.push('--goal', options.goal)
    if (options.plan) args.push('--plan', options.plan)
    if (options.planPath) args.push('--plan-path', options.planPath)
    if (options.designPath) args.push('--design-path', options.designPath)
    if (options.prompt) args.push('--prompt', options.prompt)
    if (options.messages) args.push('--messages', JSON.stringify(options.messages))

    this.process = spawn(this.pythonExe, args, {
      cwd: this.workdir,
      env: {
        ...process.env,
        ...this.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.type === 'event') {
            this.emit('event', msg.name, msg.data)
          } else if (msg.type === 'dangerous') {
            this.emit('dangerous', msg.data)
          } else if (msg.type === 'result') {
            this.emit('result', msg)
          }
        } catch { /* ignore parse errors */ }
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      this.emit('stderr', data.toString())
    })

    this.process.on('exit', (code) => {
      this.emit('exit', code)
      this.process = null
    })
  }

  send(message: object): void {
    if (this.process?.stdin) {
      this.process.stdin.write(JSON.stringify(message, null, 2) + '\n')
    }
  }

  confirmDangerous(allow: boolean, allowAll: boolean): void {
    this.send({ type: 'dangerous_confirm', allow, allow_all: allowAll })
  }

  stop(): void {
    if (this.process) {
      this.send({ type: 'stop' })
      this.process.kill('SIGTERM')
      this.process = null
    }
  }
}
