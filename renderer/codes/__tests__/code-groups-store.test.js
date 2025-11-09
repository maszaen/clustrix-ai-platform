let store;

beforeAll(async () => {
  store = await import('../code-groups-store.mjs');
});

describe('code groups store', () => {
  test('createCodeGroup seeds defaults', () => {
    const group = store.createCodeGroup('Repo', 'Description');
    expect(group.name).toBe('Repo');
    expect(group.description).toBe('Description');
    expect(group.workspacePath).toBe('');
    expect(Array.isArray(group.files)).toBe(true);
  });

  test('normalizeCodeGroup derives workspace name', () => {
    const normalized = store.normalizeCodeGroup({
      name: '',
      workspacePath: 'C:/demo/project',
    });
    expect(normalized.name).toBe('New Code Workspace');
    expect(normalized.workspaceName).toBe('project');
  });

  test('applyWorkspaceToGroup updates metadata', () => {
    const group = store.createCodeGroup('Repo');
    const updated = store.applyWorkspaceToGroup(group, {
      path: 'D:/work',
      name: 'work',
      summary: { folderCount: 2, fileCount: 10 },
    });
    expect(updated.workspacePath).toBe('D:/work');
    expect(updated.workspaceSummary.folderCount).toBe(2);
    expect(updated.last_updated).toBeDefined();
  });
});
