import * as vscode from 'vscode';
import { GitService } from '../services/GitService';
import { ConfigService } from '../services/ConfigService';
import { formatRelativeTime } from '../utils/BlameUtils';

export class FileBlameDecorator {
  private static instance: FileBlameDecorator;
  private decorationType: vscode.TextEditorDecorationType | undefined;
  private highlightDecorationType: vscode.TextEditorDecorationType | undefined;
  private gitService: GitService;
  private configService: ConfigService;
  private isVisible: boolean = false;
  private blameBlocks: { start: number; end: number; hash: string }[] = [];
  private currentEditor: vscode.TextEditor | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor() {
    this.gitService = GitService.getInstance();
    this.configService = ConfigService.getInstance();

    // Initial visibility is false by default, requires manual toggle
    this.isVisible = false;

    this.highlightDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(100, 100, 255, 0.15)',
      isWholeLine: true,
      border: '1px solid rgba(100, 100, 255, 0.3)',
      borderWidth: '0 0 0 3px',
    });

    // Listen for editor changes to auto-show
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && this.isVisible && this.configService.isFileBlameEnabled) {
        this.show(editor);
      }
    });

    // Listen for config changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitorbit.blame.file.enabled')) {
        const enabled = this.configService.isFileBlameEnabled;
        this.isVisible = enabled;
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          if (enabled) {
            this.show(editor);
          } else {
            this.hide();
          }
        }
      }
    });

    // Initial show if an editor is already active and config allows it
    if (vscode.window.activeTextEditor && this.isVisible) {
      this.show(vscode.window.activeTextEditor);
    }
  }

  public static getInstance(): FileBlameDecorator {
    if (!FileBlameDecorator.instance) {
      FileBlameDecorator.instance = new FileBlameDecorator();
    }
    return FileBlameDecorator.instance;
  }

  public async toggle(editor: vscode.TextEditor) {
    if (this.isVisible) {
      this.hide();
    } else {
      await this.show(editor);
    }
  }

  public hide() {
    if (this.decorationType) {
      this.decorationType.dispose();
      this.decorationType = undefined;
    }
    if (this.currentEditor) {
      this.currentEditor.setDecorations(this.highlightDecorationType!, []);
    }
    this.isVisible = false;
    this.blameBlocks = [];
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.currentEditor = undefined;
  }

  public async show(editor: vscode.TextEditor) {
    this.hide();
    this.isVisible = true;
    this.currentEditor = editor;

    const filePath = editor.document.uri.fsPath;
    try {
      const blameOutput = await this.gitService.getBlame(filePath);
      if (!blameOutput) return;

      const blameInfo = this.parsePorcelainBlame(blameOutput);
      const decorations: vscode.DecorationOptions[] = [];
      this.blameBlocks = [];
      // Grouping logic: Create blocks of consecutive lines with same commit hash
      let currentBlock: { start: number; end: number; hash: string } | undefined;

      blameInfo.forEach((info, index) => {
        if (index >= editor.document.lineCount) return;

        if (!currentBlock || currentBlock.hash !== info.hash) {
          if (currentBlock) {
            currentBlock.end = index - 1;
            this.blameBlocks.push(currentBlock);
          }
          currentBlock = { start: index, end: index, hash: info.hash };
        }
      });
      if (currentBlock) {
        currentBlock.end = Math.min(blameInfo.length - 1, editor.document.lineCount - 1);
        this.blameBlocks.push(currentBlock);
      }
      // Create a shared decoration type for the column styling
      this.decorationType = vscode.window.createTextEditorDecorationType({
        before: {
          margin: '0 1em 0 0',
          width: '280px',
          fontStyle: 'normal',
          fontWeight: 'normal',
          color: 'var(--vscode-descriptionForeground)',
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
      });

      // Only show text for the START of a block
      this.blameBlocks.forEach((block) => {
        const info = blameInfo[block.start];
        if (!info) return;

        const relativeTime = formatRelativeTime(info.authorTime);
        const displayText = `${info.author.padEnd(20)} | ${relativeTime.padStart(15)}`;

        decorations.push({
          range: new vscode.Range(block.start, 0, block.start, 0),
          renderOptions: {
            before: {
              contentText: displayText,
              backgroundColor: 'var(--vscode-editor-lineHighlightBackground)',
              border: '1px solid var(--vscode-editor-lineHighlightBorder)',
            },
          },
        });

        // Add empty placeholders for the rest of the block to maintain the column
        for (let i = block.start + 1; i <= block.end; i++) {
          decorations.push({
            range: new vscode.Range(i, 0, i, 0),
            renderOptions: {
              before: {
                contentText: ' '.repeat(38), // Maintain width with spaces
              },
            },
          });
        }
      });

      editor.setDecorations(this.decorationType, decorations);

      // Listen for selection changes to highlight the block
      this.disposables.push(
        vscode.window.onDidChangeTextEditorSelection((e) => {
          if (e.textEditor === editor) {
            this.highlightCurrentBlock(e.textEditor);
          }
        })
      );

      // Initial highlight
      this.highlightCurrentBlock(editor);
    } catch (error) {
      console.error('Failed to show file blame:', error);
      this.isVisible = false;
    }
  }

  private highlightCurrentBlock(editor: vscode.TextEditor) {
    if (!this.isVisible || this.blameBlocks.length === 0) return;

    const lineNumber = editor.selection.active.line;
    const block = this.blameBlocks.find((b) => lineNumber >= b.start && lineNumber <= b.end);

    if (block) {
      const range = new vscode.Range(block.start, 0, block.end, 0);
      editor.setDecorations(this.highlightDecorationType!, [range]);
    } else {
      editor.setDecorations(this.highlightDecorationType!, []);
    }
  }

  private parsePorcelainBlame(
    output: string
  ): { author: string; authorTime: number; hash: string }[] {
    const lines = output.split('\n');
    const result: { author: string; authorTime: number; hash: string }[] = [];
    let currentAuthor = '';
    let currentAuthorTime = 0;
    let currentHash = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hashMatch = line.match(/^([0-9a-f]{40})/);
      if (hashMatch) {
        currentHash = hashMatch[1];
      } else if (line.startsWith('author ')) {
        currentAuthor = line.substring(7).trim();
      } else if (line.startsWith('author-time ')) {
        currentAuthorTime = parseInt(line.substring(12).trim());
      } else if (line.startsWith('\t')) {
        result.push({ author: currentAuthor, authorTime: currentAuthorTime, hash: currentHash });
      }
    }
    return result;
  }
}
