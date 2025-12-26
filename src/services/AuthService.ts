import * as vscode from 'vscode';

export class AuthService {
  private static instance: AuthService;
  private _secretStorage: vscode.SecretStorage | undefined;
  private readonly ACCESS_TOKEN_KEY = 'gitorbit.access_token';
  private readonly REFRESH_TOKEN_KEY = 'gitorbit.refresh_token';

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public init(context: vscode.ExtensionContext) {
    this._secretStorage = context.secrets;
  }

  public async storeTokens(accessToken: string, refreshToken: string) {
    if (!this._secretStorage) return;
    await this._secretStorage.store(this.ACCESS_TOKEN_KEY, accessToken);
    await this._secretStorage.store(this.REFRESH_TOKEN_KEY, refreshToken);

    vscode.commands.executeCommand('setContext', 'gitorbit.isLoggedIn', true);
  }

  public async getAccessToken(): Promise<string | undefined> {
    const token = await this._secretStorage?.get(this.ACCESS_TOKEN_KEY);

    return token;
  }

  public async logout() {
    if (!this._secretStorage) return;
    await this._secretStorage.delete(this.ACCESS_TOKEN_KEY);
    await this._secretStorage.delete(this.REFRESH_TOKEN_KEY);

    vscode.commands.executeCommand('setContext', 'gitorbit.isLoggedIn', false);
  }

  public async isLoggedIn(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }
}
