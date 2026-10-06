import { ModuleType } from '../enums/module-type.enum';
import { DOCUMENTATION_BASE_URL, documentationTargetUrl, moduleDocumentationTarget } from './module-documentation';

describe('documentationTargetUrl', () => {
  it('supports the root and encodes path segments and fragments', () => {
    expect(documentationTargetUrl(null)).toBe(DOCUMENTATION_BASE_URL);
    expect(documentationTargetUrl({ path: '', fragment: 'intro' })).toBe(`${DOCUMENTATION_BASE_URL}#intro`);
    expect(documentationTargetUrl({ path: 'reference/some page/', fragment: 'a b#c' })).toBe(
      `${DOCUMENTATION_BASE_URL}reference/some%20page/#a%20b%23c`,
    );
  });

  it('rejects traversal, absolute URLs and encoded path tricks', () => {
    for (const path of [
      '../settings',
      'reference/../settings',
      '/reference/settings',
      'https://example.com',
      '//example.com',
      'reference/%2e%2e/settings',
      'reference\\\\settings',
      'reference/settings?x=1',
    ]) {
      expect(() => documentationTargetUrl({ path, fragment: '' })).toThrowError('Invalid documentation path');
    }
  });
});

describe('moduleDocumentationTarget', () => {
  it('targets the selected PLC algorithm section', () => {
    expect(moduleDocumentationTarget(ModuleType.PLCAlgorithm, 'BurgPLC')).toEqual({
      path: 'reference/plc_algorithm/',
      fragment: 'plctestbench.plc_algorithm.BurgPLC',
    });
  });

  it('maps each configurable module type to its package reference page', () => {
    expect(moduleDocumentationTarget(ModuleType.PacketLossSimulator, 'BinomialPLS').path).toBe(
      'reference/loss_simulator/',
    );
    expect(moduleDocumentationTarget(ModuleType.OutputAnalyser, 'PEAQCalculator').path).toBe(
      'reference/output_analyser/',
    );
    expect(moduleDocumentationTarget(ModuleType.CrossfadeSettings, 'LinearCrossfadeSettings').path).toBe(
      'reference/settings/',
    );
  });
});
