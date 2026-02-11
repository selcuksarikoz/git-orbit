import * as vscode from 'vscode';

export class AuthService {
  private static instance: AuthService;
  private _secretStorage: vscode.SecretStorage | undefined;
  private readonly ACCESS_TOKEN_KEY = 'gitorbit.token';
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

    // Update config to show token in settings input (masked)
    await vscode.workspace
      .getConfiguration('gitorbit.ai')
      .update('authInfo', accessToken, vscode.ConfigurationTarget.Global);

    vscode.commands.executeCommand('setContext', 'gitorbit.isLoggedIn', true);
  }

  public async getAccessToken(): Promise<string | undefined> {
    const token = await this._secretStorage?.get(this.ACCESS_TOKEN_KEY);

    // Sync config if token exists but config is empty
    const config = vscode.workspace.getConfiguration('gitorbit.ai');
    const authInfo = config.get<string>('authInfo');
    if (token && !authInfo) {
      await config.update('authInfo', token, vscode.ConfigurationTarget.Global);
    }

    return token;
  }

  public async getRefreshToken(): Promise<string | undefined> {
    return await this._secretStorage?.get(this.REFRESH_TOKEN_KEY);
  }

  public async refreshAccessToken(): Promise<boolean> {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await fetch('https://kuulto.app/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token || refreshToken;

      if (newAccessToken) {
        await this.storeTokens(newAccessToken, newRefreshToken);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return false;
    }
  }

  public async logout() {
    if (!this._secretStorage) return;
    await this._secretStorage.delete(this.ACCESS_TOKEN_KEY);
    await this._secretStorage.delete(this.REFRESH_TOKEN_KEY);

    // Clear config
    await vscode.workspace
      .getConfiguration('gitorbit.ai')
      .update('authInfo', '', vscode.ConfigurationTarget.Global);

    vscode.commands.executeCommand('setContext', 'gitorbit.isLoggedIn', false);
  }

  public async isLoggedIn(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }
}
