import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NavigationEnd, PRIMARY_OUTLET, Router } from '@angular/router';
import { filter, startWith, Subject, Subscription, takeUntil } from 'rxjs';
import { ThemeService } from '../shared/services/theme.service';
import {
  DOCUMENTATION_BASE_URL,
  documentationTargetUrl,
  ModuleDocumentationTarget,
} from '../shared/utils/module-documentation';

interface DocumentationThemeMessage {
  type: 'plctestbench-theme';
  theme: 'light' | 'dark';
}

@Component({
  selector: 'plc-documentation',
  templateUrl: './documentation.component.html',
  styleUrl: './documentation.component.scss',
  host: { '[class.documentation-contained]': 'contained' },
})
export class DocumentationComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public syncWithRouter = true;
  @Input() public target: ModuleDocumentationTarget | null = null;
  @Input() public contained = false;
  @Output() public escapeRequested = new EventEmitter<void>();

  public documentationUrl = DOCUMENTATION_BASE_URL;
  public documentationResourceUrl: SafeResourceUrl;

  @ViewChild('documentationFrame')
  public documentationFrame?: ElementRef<HTMLIFrameElement>;

  private readonly destroy$ = new Subject<void>();
  private frameWindow?: Window;
  private initialized = false;
  private routerSubscription?: Subscription;
  private readonly onFrameLocationChange = (): void => this.syncBrowserUrlFromFrame();
  private readonly onFrameKeyDown = (event: KeyboardEvent): void => {
    if (!this.syncWithRouter && event.key === 'Escape') {
      event.preventDefault();
      this.escapeRequested.emit();
    }
  };

  constructor(
    private readonly themeService: ThemeService,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
  ) {
    this.documentationResourceUrl = this.trustDocumentationUrl(this.documentationUrl);
  }

  public ngOnInit(): void {
    this.themeService.isDarkMode.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncTheme());
    this.initialized = true;
    this.configureRouting();
  }

  private configureRouting(): void {
    this.routerSubscription?.unsubscribe();
    this.syncTarget();
    if (!this.syncWithRouter) return;
    this.routerSubscription = this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        if (this.syncWithRouter) this.syncFrameUrlFromBrowser();
      });
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (!this.initialized) return;
    if (changes['syncWithRouter']) this.configureRouting();
    else if (changes['target']) this.syncTarget();
  }

  public onFrameLoad(): void {
    this.detachFrameListeners();
    const frameWindow = this.documentationFrame?.nativeElement.contentWindow;
    try {
      // Access may fail if a documentation link navigates to another origin.
      if (frameWindow?.location.origin !== window.location.origin) return;
      this.frameWindow = frameWindow;
      this.frameWindow?.addEventListener('hashchange', this.onFrameLocationChange);
      this.frameWindow?.addEventListener('keydown', this.onFrameKeyDown);
      this.syncTheme();
      this.syncBrowserUrlFromFrame();
    } catch {
      this.frameWindow = undefined;
    }
  }

  public ngOnDestroy(): void {
    this.detachFrameListeners();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private detachFrameListeners(): void {
    try {
      this.frameWindow?.removeEventListener('hashchange', this.onFrameLocationChange);
      this.frameWindow?.removeEventListener('keydown', this.onFrameKeyDown);
    } catch {
      // A formerly same-origin window may now be cross-origin.
    }
    this.frameWindow = undefined;
  }

  private syncTarget(): void {
    if (this.syncWithRouter) {
      this.syncFrameUrlFromBrowser();
    } else {
      this.setDocumentationUrl(documentationTargetUrl(this.target));
    }
  }

  private setDocumentationUrl(url: string): void {
    if (url === this.documentationUrl) return;
    this.documentationUrl = url;
    this.documentationResourceUrl = this.trustDocumentationUrl(url);
  }

  private syncFrameUrlFromBrowser(): void {
    const urlTree = this.router.parseUrl(this.router.url);
    const primarySegments = urlTree.root.children[PRIMARY_OUTLET]?.segments ?? [];
    const documentationSegments = primarySegments.slice(1);
    this.setDocumentationUrl(
      documentationTargetUrl({
        path: documentationSegments.map((segment) => segment.path).join('/'),
        fragment: urlTree.fragment ?? '',
      }),
    );
  }

  private syncBrowserUrlFromFrame(): void {
    if (!this.syncWithRouter) return;
    let frameLocation: Location | undefined;
    try {
      frameLocation = this.frameWindow?.location;
      if (!frameLocation?.pathname.startsWith(DOCUMENTATION_BASE_URL)) return;
    } catch {
      return;
    }

    const relativePath = frameLocation.pathname.slice(DOCUMENTATION_BASE_URL.length).replace(/^\/+|\/+$/g, '');
    const pathSegments = relativePath ? relativePath.split('/').map((segment) => decodeURIComponent(segment)) : [];
    const fragment = frameLocation.hash ? decodeURIComponent(frameLocation.hash.slice(1)) : undefined;

    // The iframe has already completed this navigation. Recording its URL before
    // updating Angular avoids assigning [src] again and loading the page twice.
    this.documentationUrl = `${frameLocation.pathname}${frameLocation.hash}`;
    const targetUrl = this.router.serializeUrl(this.router.createUrlTree(['/docs', ...pathSegments], { fragment }));

    if (targetUrl !== this.router.url) void this.router.navigateByUrl(targetUrl);
  }

  private trustDocumentationUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  private syncTheme(): void {
    const frameWindow = this.documentationFrame?.nativeElement.contentWindow;
    if (!frameWindow) return;

    const message: DocumentationThemeMessage = {
      type: 'plctestbench-theme',
      theme: this.themeService.isDarkMode.value ? 'dark' : 'light',
    };
    frameWindow.postMessage(message, window.location.origin);
  }
}
