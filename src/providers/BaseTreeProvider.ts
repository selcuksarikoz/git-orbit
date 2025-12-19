import * as vscode from "vscode";

export abstract class BaseTreeProvider<T>
  implements vscode.TreeDataProvider<T>
{
  protected _onDidChangeTreeData: vscode.EventEmitter<
    T | undefined | null | void
  > = new vscode.EventEmitter<T | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<T | undefined | null | void> =
    this._onDidChangeTreeData.event;

  protected filterText: string = "";

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setFilter(filter: string): void {
    this.filterText = filter;
    this.refresh();
  }

  abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;
  abstract getChildren(element?: T): vscode.ProviderResult<T[]>;

  resolveTreeItem?(
    item: vscode.TreeItem,
    element: T,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TreeItem>;
}
