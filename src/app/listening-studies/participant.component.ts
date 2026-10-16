import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { firstValueFrom } from 'rxjs';
import { ListeningClient, listeningError } from './listening.client';
import { ParticipantCheckpoint } from './listening.models';
import { ProtocolHtmlPipe } from './protocol-html.pipe';
import { ThemeService } from '../shared/services/theme.service';

@Component({
  selector: 'plc-listening-participant',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ProtocolHtmlPipe],
  template: `
    <main class="participant">
      <header class="study-header">
        <h1>{{ runName ? runName + ' - Listening study' : 'Listening study' }}</h1>
      </header>
      @if (error) {
        <p role="alert">{{ error }}</p>
      }
      @if (loading) {
        <p>Opening your private listening invitation…</p>
      }
      @if (checkpoint; as session) {
        @if (session.status === 'completed') {
          <h2>Your responses have been saved. Thank you.</h2>
          <p>The owner closes the study separately. Completed sessions are read-only.</p>
        } @else if (session.study_status !== 'collecting') {
          <h2>Collection closed</h2>
          <p>This unfinished draft is frozen and is not included in analysis. No new ratings can be saved.</p>
        } @else if (!session.consent_acknowledged) {
          <section>
            <p>
              {{ session.trial_order.length }} trials, every assigned stimulus rated by every participant. Allow roughly
              1–2 minutes per trial; use a desktop browser (Chrome/Edge recommended), headphones, and a quiet
              environment. Take breaks and resume with this same invitation link.
            </p>
            <h2>Instructions</h2>
            <div class="plain instructions-content" [innerHTML]="session.instructions | protocolHtml"></div>
            <h2>Consent · version {{ session.consent_version }}</h2>
            <div class="plain" [innerHTML]="session.consent | protocolHtml"></div>
            <label>
              <input type="checkbox" [(ngModel)]="accepted" />
              I explicitly agree to the consent statement above.
            </label>
            <p-button
              label="Agree and continue"
              [disabled]="!accepted || consenting"
              [loading]="consenting"
              (onClick)="consent()"
            />
          </section>
        } @else {
          <section class="study-instructions" aria-labelledby="study-instructions-heading">
            <h2 id="study-instructions-heading">Instructions</h2>
            <div class="plain instructions-content" [innerHTML]="session.instructions | protocolHtml"></div>
          </section>
          <iframe
            #player
            title="MUSHRA listening player"
            src="/api/listening-client/index.html?v=shared-faders-20261016-2"
            sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
            referrerpolicy="no-referrer"
            (load)="initializePlayer()"
          ></iframe>
        }
      }
    </main>
  `,
  styles: [
    `
      .participant {
        max-width: 1400px;
        margin: auto;
        padding: 1.5rem;
        color: var(--p-text-color);
      }
      .study-header {
        margin-bottom: 1.5rem;
      }
      .study-header h1 {
        margin: 0;
        font-size: clamp(1.5rem, 3vw, 2rem);
        font-weight: 600;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .study-instructions {
        margin-bottom: 1.5rem;
        border-inline-start: 4px solid var(--p-primary-color);
      }
      .study-instructions h2 {
        margin: 0 0 0.75rem;
        font-size: 1.125rem;
        font-weight: 600;
      }
      .instructions-content {
        color: var(--p-text-muted-color);
      }
      section {
        padding: 1.5rem;
        background: var(--p-content-background);
        border: 1px solid var(--p-content-border-color);
        border-radius: 1rem;
      }
      label {
        display: flex;
        gap: 0.7rem;
        margin: 1.5rem 0;
      }
      .plain {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        line-height: 1.6;
      }
      iframe {
        width: 100%;
        display: block;
        height: auto;
        min-height: 1px;
        border: 1px solid var(--p-content-border-color);
        border-radius: 0.75rem;
      }
      p[role='alert'] {
        border-left: 4px solid var(--p-orange-500);
        padding: 1rem;
      }
    `,
  ],
})
export class ParticipantComponent implements OnInit, OnDestroy {
  @ViewChild('player') private player?: ElementRef<HTMLIFrameElement>;
  public checkpoint: ParticipantCheckpoint | null = null;
  public runName = '';
  public loading = true;
  public consenting = false;
  public accepted = false;
  public error = '';
  private dirty = false;
  private readonly nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  private consentRequestId: string | null = null;
  private readonly destroyRef = inject(DestroyRef);
  private observer?: MutationObserver;
  private playerResizeObserver?: ResizeObserver;
  constructor(
    private readonly client: ListeningClient,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly theme: ThemeService,
  ) {}

  public async ngOnInit(): Promise<void> {
    const token = new URLSearchParams(location.hash.slice(1)).get('invite');
    if (token) history.replaceState(history.state, '', location.pathname + location.search); // Never put bearer tokens into logs/storage/referrers.
    if (!window.isSecureContext) {
      this.error = 'HTTPS (or localhost) is required for private listening cookies and audio.';
      this.loading = false;
      return;
    }
    try {
      if (token) {
        const session = await firstValueFrom(this.client.exchange(token));
        await this.router.navigate(['/listening-participant', session.session_id], { replaceUrl: true });
      } else {
        const id = this.route.snapshot.paramMap.get('sessionId');
        if (!id) throw new Error('Open your individual invitation link to begin or resume.');
        this.checkpoint = await firstValueFrom(this.client.checkpoint(id));
        this.runName = this.checkpoint.run_name ?? '';
      }
    } catch (error) {
      this.error =
        error instanceof Error && !(error as { status?: number }).status ? error.message : listeningError(error);
    } finally {
      this.loading = false;
    }
    this.theme.isDarkMode.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.sendTheme());
    this.observer = new MutationObserver(() => this.sendTheme());
    this.observer.observe(document.head, { childList: true, subtree: true });
  }
  public async consent(): Promise<void> {
    if (!this.checkpoint || !this.accepted || this.consenting) return;
    this.consenting = true;
    this.error = '';
    this.consentRequestId ??= crypto.randomUUID();
    try {
      this.checkpoint = await firstValueFrom(this.client.consent(this.checkpoint, this.consentRequestId));
    } catch (error) {
      this.error = listeningError(error);
    } finally {
      this.consenting = false;
    }
  }
  public initializePlayer(): void {
    this.playerResizeObserver?.disconnect();
    const frame = this.player?.nativeElement;
    const body = frame?.contentDocument?.body;
    if (frame && body) {
      const resize = () => {
        // Measure the body, not the viewport-sized document, so the frame can shrink too.
        const style = getComputedStyle(body);
        const height = Math.ceil(
          Math.max(body.getBoundingClientRect().height, body.scrollHeight) +
            parseFloat(style.marginTop) +
            parseFloat(style.marginBottom),
        );
        // Global border-box sizing includes the iframe border in its height.
        const frameStyle = getComputedStyle(frame);
        const borders = parseFloat(frameStyle.borderTopWidth) + parseFloat(frameStyle.borderBottomWidth);
        frame.style.height = `${height + borders + 1}px`;
      };
      this.playerResizeObserver = new ResizeObserver(resize);
      this.playerResizeObserver.observe(body);
      resize();
    }
    if (this.checkpoint) this.send({ type: 'plc-listening-init', checkpoint: this.checkpoint, theme: this.colors() });
  }
  @HostListener('window:message', ['$event'])
  public async message(event: MessageEvent): Promise<void> {
    if (event.origin !== location.origin || event.source !== this.player?.nativeElement.contentWindow) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'plc-listening-ready') {
      this.initializePlayer();
      return;
    }
    if (message.nonce !== this.nonce || message.session_id !== this.checkpoint?.session_id) return;
    if (message.type === 'plc-listening-dirty') this.dirty = true;
    if (message.type === 'plc-listening-saved') this.dirty = false;
    if (message.type === 'plc-listening-reload') location.reload();
    if (message.type === 'plc-listening-complete' && this.checkpoint) {
      try {
        // Independently verify persistence; an iframe message alone is not completion.
        const saved = await firstValueFrom(this.client.checkpoint(this.checkpoint.session_id));
        if (saved.status === 'completed') {
          this.checkpoint = saved;
          this.dirty = false;
        }
      } catch (error) {
        this.error = listeningError(error);
      }
    }
  }
  @HostListener('window:beforeunload', ['$event'])
  public beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  public ngOnDestroy(): void {
    this.observer?.disconnect();
    this.playerResizeObserver?.disconnect();
    this.send({ type: 'plc-listening-shutdown' });
  }
  private send(value: Record<string, unknown>): void {
    this.player?.nativeElement.contentWindow?.postMessage({ ...value, nonce: this.nonce }, location.origin);
  }
  private sendTheme(): void {
    this.send({ type: 'plc-listening-theme', theme: this.colors() });
  }
  private colors(): { dark: boolean; primary: string } {
    const probe = document.createElement('span');
    probe.style.color = 'var(--p-primary-color)';
    probe.hidden = true;
    document.body.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    return { dark: this.theme.isDarkMode.value, primary };
  }
}
