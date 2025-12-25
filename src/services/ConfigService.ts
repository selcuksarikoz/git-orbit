import * as vscode from 'vscode';

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
    return vscode.workspace.getConfiguration('gitorbit').get<T>(key);
  }

  public get featurePrefix(): string {
    return this.get<string>('gitflow.featurePrefix') || 'feature/';
  }

  public get featureBase(): string {
    return this.get<string>('gitflow.featureBase') || '';
  }

  public get hotfixPrefix(): string {
    return this.get<string>('gitflow.hotfixPrefix') || 'hotfix/';
  }

  public get hotfixBase(): string {
    return this.get<string>('gitflow.hotfixBase') || '';
  }

  public get bugfixPrefix(): string {
    return this.get<string>('gitflow.bugfixPrefix') || 'bugfix/';
  }

  public get bugfixBase(): string {
    return this.get<string>('gitflow.bugfixBase') || '';
  }

  public get releasePrefix(): string {
    return this.get<string>('gitflow.releasePrefix') || 'release/';
  }

  public get releaseBase(): string {
    return this.get<string>('gitflow.releaseBase') || '';
  }

  public get commitLimit(): number {
    return this.get<number>('views.commitLimit') || 20;
  }

  public get isInlineBlameEnabled(): boolean {
    return this.get<boolean>('blame.inline.enabled') ?? true;
  }

  public get isGutterBlameEnabled(): boolean {
    return this.get<boolean>('blame.gutter.enabled') ?? true;
  }

  public get isFileBlameEnabled(): boolean {
    return this.get<boolean>('blame.file.enabled') ?? true;
  }

  public get isTagsViewEnabled(): boolean {
    return this.get<boolean>('views.showTags') ?? true;
  }

  public get isContributorsViewEnabled(): boolean {
    return this.get<boolean>('views.showContributors') ?? true;
  }

  public get autoSyncInterval(): number {
    return this.get<number>('sync.autoSyncInterval') || 10;
  }
}
