import { toRawGitHubUrl } from '@/ui/modals/McpImportModal';

describe('McpImportModal helpers', () => {
  it('keeps raw GitHub URLs unchanged', () => {
    const url = 'https://raw.githubusercontent.com/foo/bar/main/mcp.json';
    expect(toRawGitHubUrl(url)).toBe(url);
  });

  it('converts github blob URLs to raw URLs', () => {
    expect(toRawGitHubUrl('https://github.com/foo/bar/blob/main/path/to/mcp.json')).toBe(
      'https://raw.githubusercontent.com/foo/bar/main/path/to/mcp.json'
    );
  });

  it('returns non-GitHub URLs unchanged', () => {
    const url = 'https://example.com/mcp.json';
    expect(toRawGitHubUrl(url)).toBe(url);
  });
});
