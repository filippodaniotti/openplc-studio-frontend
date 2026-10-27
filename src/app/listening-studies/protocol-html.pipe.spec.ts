import { ProtocolHtmlPipe } from './protocol-html.pipe';

describe('ProtocolHtmlPipe', () => {
  const pipe = new ProtocolHtmlPipe();
  it('preserves basic formatting and escapes plain text', () => {
    expect(pipe.transform('<p><strong>Listen</strong></p><ul><li>Quiet room</li></ul>')).toBe(
      '<p><strong>Listen</strong></p><ul><li>Quiet room</li></ul>',
    );
    expect(pipe.transform('Quiet & calm')).toBe('Quiet &amp; calm');
  });
  it('removes active content, remote media, links, and all attributes', () => {
    expect(
      pipe.transform(
        '<p onclick="alert(1)" style="color:red">Safe</p><script>alert(1)</script><img src="/track"><a href="javascript:alert(1)">Contact</a><svg><text>Hidden</text></svg>',
      ),
    ).toBe('<p>Safe</p>Contact');
  });
});
