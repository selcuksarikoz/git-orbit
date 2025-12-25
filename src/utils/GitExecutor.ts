import * as cp from 'child_process';
import * as vscode from 'vscode';

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitExecutor {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  public async exec(args: string[]): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const gitPath = 'git'; // Usually in PATH
      const process = cp.spawn(gitPath, args, { cwd: this.baseDir });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: 0 });
        } else {
          reject(new Error(`Git command failed with exit code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        reject(err);
      });
    });
  }
}
