import { Pipe, PipeTransform } from '@angular/core';

/** Basic protocol formatting only; Angular also sanitizes the innerHTML binding. */
@Pipe({ name: 'protocolHtml', standalone: true })
export class ProtocolHtmlPipe implements PipeTransform {
  public transform(value: string): string {
    const document = new DOMParser().parseFromString(value, 'text/html');
    const allowed = new Set([
      'P',
      'DIV',
      'BR',
      'STRONG',
      'B',
      'EM',
      'I',
      'U',
      'S',
      'UL',
      'OL',
      'LI',
      'H1',
      'H2',
      'H3',
      'H4',
      'BLOCKQUOTE',
      'PRE',
      'CODE',
      'HR',
      'SPAN',
    ]);
    const blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'TEMPLATE', 'SVG', 'MATH']);
    const clean = (parent: Element): void => {
      for (const child of Array.from(parent.children)) {
        const tag = child.tagName.toUpperCase();
        if (blocked.has(tag)) {
          child.remove();
          continue;
        }
        clean(child);
        if (!allowed.has(tag)) child.replaceWith(...Array.from(child.childNodes));
        else for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
      }
    };
    clean(document.body);
    return document.body.innerHTML;
  }
}
