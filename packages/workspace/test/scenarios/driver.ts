export interface WorkspaceScenarioSession<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate> {
  execute(command: Command): Promise<CommandResult>;
  read(request: ViewRequest): Promise<View>;
  subscribe(scope: ViewScope, onUpdate: (update: ViewUpdate) => void): () => void;
}

export interface WorkspaceScenario<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate> {
  readonly name: string;
  run(
    workspace: WorkspaceScenarioSession<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate>,
  ): Promise<void>;
}

export async function runWorkspaceScenario<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate>(
  workspace: WorkspaceScenarioSession<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate>,
  scenario: WorkspaceScenario<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate>,
): Promise<void> {
  if (scenario.name.trim().length === 0) {
    throw new Error('Workspace scenarios require a stable name');
  }

  try {
    await scenario.run(workspace);
  } catch (error) {
    throw new Error(`Workspace scenario "${scenario.name}" failed`, { cause: error });
  }
}
