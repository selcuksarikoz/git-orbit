import * as vscode from "vscode";

export class ConfigService {
  private static instance: ConfigService;

  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration("gitorbit").get<T>(key);
  }

  public get featurePrefix(): string {
    return this.get<string>("gitflow.featurePrefix") || "feature/";
  }

  public get hotfixPrefix(): string {
    return this.get<string>("gitflow.hotfixPrefix") || "hotfix/";
  }

  public get commitLimit(): number {
    return this.get<number>("views.commitLimit") || 20;
  }

  public get isInlineBlameEnabled(): boolean {
    return this.get<boolean>("blame.inline.enabled") || true;
  }
}
