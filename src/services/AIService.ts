import * as vscode from "vscode";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export class AIService {
  private static instance: AIService;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public validateConfig(): boolean {
    const config = vscode.workspace.getConfiguration("gitorbit.ai");
    const apiKey = config.get<string>("apiKey");
    const provider = config.get<string>("provider") || "openrouter";

    if (!apiKey) {
      vscode.window
        .showErrorMessage(
          `API Key for ${provider} is missing. Please configure 'gitorbit.ai.apiKey' in settings.`,
          "Open Settings"
        )
        .then((selection) => {
          if (selection === "Open Settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "gitorbit.ai.apiKey"
            );
          }
        });
      return false;
    }
    return true;
  }

  private getModel() {
    const config = vscode.workspace.getConfiguration("gitorbit.ai");
    const provider = config.get<string>("provider") || "openrouter";
    const modelName = config.get<string>("model") || "openai/gpt-4o-mini";
    const apiKey = config.get<string>("apiKey");

    if (!apiKey) {
      throw new Error("API Key is missing.");
    }

    if (provider === "openai") {
      const openai = createOpenAI({ apiKey });
      return openai(modelName);
    } else if (provider === "gemini") {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelName);
    } else if (provider === "anthropic") {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelName);
    } else if (provider === "xgrok") {
      const xai = createXai({ apiKey });
      return xai(modelName);
    } else if (provider === "openrouter") {
      const openrouter = createOpenRouter({ apiKey });
      return openrouter(modelName);
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  public async generateCommitMessages(diff: string): Promise<string[]> {
    if (!diff || diff.trim().length === 0) {
      throw new Error("No changes to generate commit message for.");
    }

    // Truncate diff if it's too massive to avoid context limits or huge costs
    const maxDiffLength = 50000;
    const truncatedDiff =
      diff.length > maxDiffLength
        ? diff.substring(0, maxDiffLength) + "...(truncated)"
        : diff;

    const model = this.getModel();

    const prompt = `
    You are an expert developer. Generate 5 conventional commit messages for the following git diff.
    Rules:
    - Return ONLY the raw commit messages.
    - One message per line.
    - No numbering (1., 2., etc).
    - No markdown formatting (no backticks, no bullets).
    - Use Conventional Commits format (feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert).
    - Keep concise (under 72 chars).

    Diff:
    ${truncatedDiff}
    `;

    try {
      const { text } = await generateText({
        model: model,
        prompt: prompt,
        temperature: 0.7,
      });

      return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) =>
          line.replace(/^[\d\-\*\.]+\s*/, "").replace(/^[`"']|[`"']$/g, "")
        ) // Remove leading numbering/bullets/quotes
        .filter((line) => line.length > 0);
    } catch (error: any) {
      console.error("AI Generation failed:", error);
      throw new Error(`AI Generation failed: ${error.message}`);
    }
  }
}
