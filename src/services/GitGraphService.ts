import { GitService } from './GitService';

export interface GitGraphNode {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
  timestamp: number;
  parents: string[];
  refs: string[]; // branches, tags
  column: number; // visual column position
  row: number; // visual row position
}

export interface GitGraphEdge {
  from: string; // commit hash
  to: string; // commit hash
  fromColumn: number;
  toColumn: number;
  color: string;
  type: 'normal' | 'merge';
}

export interface GitGraphData {
  nodes: GitGraphNode[];
  edges: GitGraphEdge[];
  branches: Map<string, { color: string; column: number }>;
  maxColumn: number;
}

export class GitGraphService {
  private gitService: GitService;
  private branchColors: string[] = [
    '#E06C75', // red
    '#98C379', // green
    '#61AFEF', // blue
    '#C678DD', // purple
    '#E5C07B', // yellow
    '#56B6C2', // cyan
    '#D19A66', // orange
    '#ABB2BF', // gray
  ];

  constructor() {
    this.gitService = GitService.getInstance();
  }

  /**
   * Get graph data for visualization
   */
  async getGraphData(limit: number = 100): Promise<GitGraphData> {
    const logOutput = await this.getGitLog(limit);
    return this.parseGitLog(logOutput);
  }

  /**
   * Execute git log command with graph information
   */
  private async getGitLog(limit: number): Promise<string> {
    await this.gitService['_ensureInitialized']();
    const executor = this.gitService['executor'];

    if (!executor) {
      throw new Error('Git executor not initialized');
    }

    const result = await executor.exec([
      'log',
      '--all',
      '--graph',
      '--pretty=format:%H|%h|%P|%an|%ae|%at|%s|%D',
      `--max-count=${limit}`,
      '--date-order',
    ]);

    return result.stdout;
  }

  /**
   * Parse git log output into graph data structure
   */
  private parseGitLog(logOutput: string): GitGraphData {
    const lines = logOutput.split('\n');
    const nodes: GitGraphNode[] = [];
    const edges: GitGraphEdge[] = [];
    const branches = new Map<string, { color: string; column: number }>();
    const columnMap = new Map<string, number>(); // hash -> column
    let maxColumn = 0;

    lines.forEach((line, index) => {
      if (!line.trim()) return;

      // Extract graph characters and commit data
      const graphMatch = line.match(/^([|\\/\s*]+)/);
      const graphPart = graphMatch ? graphMatch[1] : '';
      const dataLine = line.substring(graphPart.length);

      // Skip lines without commit data
      if (!dataLine.includes('|')) return;

      // Parse commit data: hash|shortHash|parents|author|email|timestamp|message|refs
      const parts = dataLine.split('|');
      if (parts.length < 7) return;

      const [hash, shortHash, parentsStr, author, authorEmail, timestampStr, message, refsStr] =
        parts;
      const parents = parentsStr ? parentsStr.split(' ').filter((p) => p) : [];
      const refs = refsStr
        ? refsStr
            .split(',')
            .map((r) => r.trim())
            .filter((r) => r)
        : [];
      const timestamp = parseInt(timestampStr);

      // Calculate column position based on graph characters
      const column = this.calculateColumn(graphPart, hash, parents, columnMap);
      columnMap.set(hash, column);
      maxColumn = Math.max(maxColumn, column);

      // Assign branch colors
      refs.forEach((ref) => {
        if (!branches.has(ref)) {
          const colorIndex = branches.size % this.branchColors.length;
          branches.set(ref, {
            color: this.branchColors[colorIndex],
            column,
          });
        }
      });

      const node: GitGraphNode = {
        hash,
        shortHash,
        message,
        author,
        authorEmail,
        date: new Date(timestamp * 1000),
        timestamp,
        parents,
        refs,
        column,
        row: index,
      };

      nodes.push(node);

      // Create edges to parents
      parents.forEach((parentHash, idx) => {
        const parentColumn = columnMap.get(parentHash) ?? column;
        const edgeColor = this.getEdgeColor(column, branches, refs);

        edges.push({
          from: hash,
          to: parentHash,
          fromColumn: column,
          toColumn: parentColumn,
          color: edgeColor,
          type: idx > 0 ? 'merge' : 'normal',
        });
      });
    });

    return { nodes, edges, branches, maxColumn };
  }

  /**
   * Calculate column position for a commit
   */
  private calculateColumn(
    graphPart: string,
    hash: string,
    parents: string[],
    columnMap: Map<string, number>
  ): number {
    // Count the position of the commit marker (*) in the graph
    let column = 0;
    let foundCommit = false;

    for (let i = 0; i < graphPart.length; i++) {
      const char = graphPart[i];

      if (char === '*') {
        foundCommit = true;
        break;
      } else if (char === '|' || char === '/' || char === '\\') {
        column++;
      }
    }

    // If we have parents, try to align with them
    if (parents.length > 0 && columnMap.has(parents[0])) {
      return columnMap.get(parents[0])!;
    }

    return foundCommit ? column : 0;
  }

  /**
   * Get edge color based on branch
   */
  private getEdgeColor(
    column: number,
    branches: Map<string, { color: string; column: number }>,
    refs: string[]
  ): string {
    // Try to match branch color
    for (const ref of refs) {
      const branch = branches.get(ref);
      if (branch) {
        return branch.color;
      }
    }

    // Fallback to column-based color
    return this.branchColors[column % this.branchColors.length];
  }

  /**
   * Search commits by message or author
   */
  async searchCommits(query: string, limit: number = 50): Promise<GitGraphNode[]> {
    const data = await this.getGraphData(limit);
    const lowerQuery = query.toLowerCase();

    return data.nodes.filter(
      (node) =>
        node.message.toLowerCase().includes(lowerQuery) ||
        node.author.toLowerCase().includes(lowerQuery) ||
        node.hash.toLowerCase().includes(lowerQuery)
    );
  }
}
