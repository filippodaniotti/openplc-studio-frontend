import { ElementRef, SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, NavigationEnd, Router, UrlCreationOptions, UrlTree } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { ThemeService } from '../shared/services/theme.service';
import { DocumentationComponent } from './documentation.component';

class ThemeServiceStub {
  public readonly isDarkMode = new BehaviorSubject<boolean>(false);
}

class RouterStub {
  public url = '/docs';
  public readonly events = new Subject<NavigationEnd>();
  public readonly navigateByUrl = jasmine.createSpy('navigateByUrl').and.callFake((url: string | UrlTree) => {
    this.url = typeof url === 'string' ? url : this.serializeUrl(url);
    this.events.next(new NavigationEnd(1, this.url, this.url));
    return Promise.resolve(true);
  });

  private readonly serializer = new DefaultUrlSerializer();

  public parseUrl(url: string): UrlTree {
    return this.serializer.parse(url);
  }

  public serializeUrl(url: UrlTree): string {
    return this.serializer.serialize(url);
  }

  public createUrlTree(commands: any[], options: UrlCreationOptions = {}): UrlTree {
    const path = commands
      .map((command) => String(command).replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
    const tree = this.serializer.parse(`/${path}`);
    tree.fragment = options.fragment ?? null;
    return tree;
  }
}

function documentationWindow(pathname = '/api/plctestbench-docs/', hash = ''): Window {
  const target = new EventTarget() as Window;
  Object.defineProperties(target, {
    location: { value: { pathname, hash, origin: window.location.origin }, configurable: true },
    postMessage: { value: jasmine.createSpy('postMessage') },
  });
  return target;
}

describe('DocumentationComponent', () => {
  let themeService: ThemeServiceStub;
  let router: RouterStub;
  let component: DocumentationComponent;
  let frameWindow: Window;

  beforeEach(() => {
    themeService = new ThemeServiceStub();
    router = new RouterStub();
    const sanitizer = { bypassSecurityTrustResourceUrl: (url: string) => url };
    component = new DocumentationComponent(themeService as any, router as unknown as Router, sanitizer as any);
    frameWindow = documentationWindow();
    component.documentationFrame = new ElementRef({ contentWindow: frameWindow } as unknown as HTMLIFrameElement);
  });

  it('renders the backend documentation endpoint with an accessible title', async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentationComponent],
      providers: [
        { provide: ThemeService, useValue: themeService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DocumentationComponent);
    fixture.detectChanges();
    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;

    expect(iframe.getAttribute('src')).toBe('/api/plctestbench-docs/');
    expect(iframe.title).toBe('PLCTestbench documentation');
    fixture.destroy();
  });

  it('maps a nested application URL to the matching documentation page', () => {
    router.url = '/docs/guides/models-and-metrics';

    component.ngOnInit();

    expect(component.documentationUrl).toBe('/api/plctestbench-docs/guides/models-and-metrics/');
  });

  it('maps API reference fragments to the embedded documentation URL', () => {
    router.url = '/docs/reference/plc_algorithm#plctestbench.plc_algorithm.BurgPLC';

    component.ngOnInit();

    expect(component.documentationUrl).toBe(
      '/api/plctestbench-docs/reference/plc_algorithm/#plctestbench.plc_algorithm.BurgPLC',
    );
  });

  it('updates the application URL when the iframe navigates', () => {
    frameWindow = documentationWindow('/api/plctestbench-docs/guides/models-and-metrics/');
    component.documentationFrame = new ElementRef({ contentWindow: frameWindow } as unknown as HTMLIFrameElement);

    component.onFrameLoad();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/docs/guides/models-and-metrics');
  });

  it('updates the application fragment when the iframe hash changes', () => {
    frameWindow = documentationWindow('/api/plctestbench-docs/reference/plc_algorithm/');
    component.documentationFrame = new ElementRef({ contentWindow: frameWindow } as unknown as HTMLIFrameElement);
    component.onFrameLoad();
    router.navigateByUrl.calls.reset();

    (frameWindow.location as unknown as { hash: string }).hash = '#plctestbench.plc_algorithm.BurgPLC';
    frameWindow.dispatchEvent(new Event('hashchange'));

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/docs/reference/plc_algorithm#plctestbench.plc_algorithm.BurgPLC',
    );
  });

  it('synchronizes theme changes and iframe reloads', () => {
    component.ngOnInit();
    const postMessage = frameWindow.postMessage as jasmine.Spy;
    postMessage.calls.reset();

    themeService.isDarkMode.next(true);
    component.onFrameLoad();

    expect(postMessage.calls.allArgs()).toEqual([
      [{ type: 'plctestbench-theme', theme: 'dark' }, window.location.origin],
      [{ type: 'plctestbench-theme', theme: 'dark' }, window.location.origin],
    ]);
  });

  it('uses an explicit target without subscribing to or updating router navigation', () => {
    component.syncWithRouter = false;
    component.target = { path: 'reference/plc_algorithm/', fragment: 'plctestbench.plc_algorithm.BurgPLC' };
    component.ngOnInit();
    expect(router.events.observed).toBeFalse();
    expect(component.documentationUrl).toBe(
      '/api/plctestbench-docs/reference/plc_algorithm/#plctestbench.plc_algorithm.BurgPLC',
    );
    component.onFrameLoad();
    (frameWindow.location as unknown as { hash: string }).hash = '#another';
    frameWindow.dispatchEvent(new Event('hashchange'));
    router.url = '/run-configurator';
    router.events.next(new NavigationEnd(1, router.url, router.url));
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.documentationUrl).toContain('#plctestbench.plc_algorithm.BurgPLC');
    component.ngOnDestroy();
  });

  it('updates explicit targets and enables routing if the mode changes', () => {
    component.syncWithRouter = false;
    component.ngOnInit();
    component.target = { path: 'reference/settings/', fragment: 'LinearCrossfadeSettings' };
    component.ngOnChanges({ target: new SimpleChange(null, component.target, false) });
    expect(component.documentationUrl).toBe('/api/plctestbench-docs/reference/settings/#LinearCrossfadeSettings');
    component.syncWithRouter = true;
    component.ngOnChanges({ syncWithRouter: new SimpleChange(false, true, false) });
    expect(router.events.observed).toBeTrue();
    expect(component.documentationUrl).toBe('/api/plctestbench-docs/');
    component.ngOnDestroy();
  });

  it('emits Escape from a contained frame and removes listeners on destruction', () => {
    component.syncWithRouter = false;
    const escape = jasmine.createSpy('escape');
    component.escapeRequested.subscribe(escape);
    component.ngOnInit();
    component.onFrameLoad();
    frameWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(escape).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
    frameWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(escape).toHaveBeenCalledTimes(1);
  });

  it('tolerates frames that navigate to a different origin', () => {
    Object.defineProperty(frameWindow, 'location', {
      get: () => {
        throw new DOMException('Cross-origin', 'SecurityError');
      },
    });
    expect(() => component.onFrameLoad()).not.toThrow();
    expect(() => component.ngOnDestroy()).not.toThrow();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('stops synchronizing after destruction', () => {
    component.ngOnInit();
    component.ngOnDestroy();
    const postMessage = frameWindow.postMessage as jasmine.Spy;
    postMessage.calls.reset();

    themeService.isDarkMode.next(true);

    expect(postMessage).not.toHaveBeenCalled();
  });
});
