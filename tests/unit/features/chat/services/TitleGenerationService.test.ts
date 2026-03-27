import { TitleGenerationService } from '@/features/chat/services/TitleGenerationService';

describe('TitleGenerationService', () => {
  it('generates titles without enabling MCP and uses the title model override', async () => {
    const streamQuery = jest.fn().mockImplementation(
      () => (async function* () {
        yield '"Runtime MCP Safe Title"';
      })()
    );

    const plugin = {
      settings: {
        titleGenerationModel: 'gpt-5.4-mini',
      },
      agentService: {
        streamQuery,
      },
    } as any;

    const service = new TitleGenerationService(plugin);
    const callback = jest.fn().mockResolvedValue(undefined);

    await service.generateTitle('conv-1', 'First prompt', 'Assistant response', callback);

    expect(streamQuery).toHaveBeenCalledWith(
      expect.stringContaining('Generate a title for this conversation:'),
      {
        disableMcp: true,
        skipResume: true,
        model: 'gpt-5.4-mini',
      }
    );
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'Runtime MCP Safe Title',
    });
  });
});
