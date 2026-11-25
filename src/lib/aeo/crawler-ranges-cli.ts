const args = process.argv.slice(2);
if (args.length !== 1 || !['--status', '--refresh'].includes(args[0])) {
  console.error('Usage: node dist/aeo-crawler-ranges.mjs --status | --refresh');
  process.exitCode = 2;
} else {
  const { default: prisma } = await import('@/lib/prisma');
  try {
    const { rangeSourceHealth, refreshRangeSources } = await import(
      '@/lib/liekan/upstream/crawler-ranges'
    );
    const { withPublishedRegistry } = await import(
      '@/lib/liekan/upstream/crawler-registry-context'
    );
    await withPublishedRegistry(async catalog => {
      if (catalog.state !== 'published') throw new Error('Crawler registry unavailable');
      if (args[0] === '--refresh') await refreshRangeSources();
      const sources = await rangeSourceHealth(Date.now(), { initialize: false });
      console.log(JSON.stringify({ checkedAt: new Date().toISOString(), sources }));
    });
  } catch {
    console.error('Crawler range maintenance could not complete');
    process.exitCode = 1;
  } finally {
    await prisma.client.$disconnect();
  }
}
