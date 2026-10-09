import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { catchError, exhaustMap, firstValueFrom, forkJoin, of, timer } from 'rxjs';
import { ListeningClient, listeningError } from './listening.client';
import { SessionHead, Study, StudyResults } from './listening.models';
import { StudyResultsComponent } from './study-results.component';
import { StudyLmmVisualizationsComponent } from './charts/study-lmm-visualizations.component';
import { ProtocolHtmlPipe } from './protocol-html.pipe';
import { RunsClient } from '../shared/clients/runs.client';
import { RunStatus } from '../shared/enums/run-status.enum';
import { WsService } from '../shared/services/ws.service';

@Component({
  selector: 'plc-study-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    PaginatorModule,
    StudyResultsComponent,
    StudyLmmVisualizationsComponent,
    ProtocolHtmlPipe,
  ],
  templateUrl: './study-hub.component.html',
  styleUrl: './study-hub.component.scss',
})
export class StudyHubComponent implements OnInit {
  public studies: Study[] = [];
  public selected: Study | null = null;
  public heads: SessionHead[] = [];
  public participantPage = 0;
  public participantPageSize = 5;
  public participantActionsVisible = false;
  private participantActionId: string | null = null;

  public get actionParticipant(): SessionHead | null {
    return this.heads.find((head) => head.session_id === this.participantActionId) ?? null;
  }

  public openParticipantActions(head: SessionHead): void {
    this.participantActionId = head.session_id;
    this.participantActionsVisible = true;
  }

  public get participantFirst(): number {
    const lastPage = Math.max(0, Math.ceil(this.heads.length / this.participantPageSize) - 1);
    return Math.min(this.participantPage, lastPage) * this.participantPageSize;
  }

  public get visibleParticipants(): SessionHead[] {
    return this.heads.slice(this.participantFirst, this.participantFirst + this.participantPageSize);
  }

  public pageParticipants(event: PaginatorState): void {
    this.participantPageSize = event.rows ?? this.participantPageSize;
    this.participantPage = Math.floor((event.first ?? 0) / this.participantPageSize);
  }
  public results: StudyResults | null = null;
  public loading = true;
  public busy = false;
  public error = '';
  public notice = '';
  public links: string[] = [];
  public invitationCount = 1;
  public instructions = '';
  public consent = '';
  public reasons: Partial<Record<string, string>> = {};
  public runName = '';
  public runStatus: RunStatus | null = null;
  public runId = '';
  private readonly destroyRef = inject(DestroyRef);
  private generation = 0;
  private detailLoading = false;
  constructor(
    public readonly client: ListeningClient,
    private readonly route: ActivatedRoute,
    private readonly runs: RunsClient,
    private readonly ws: WsService,
  ) {}

  public ngOnInit(): void {
    this.runId = this.route.snapshot.paramMap.get('runId') ?? '';
    this.runs
      .getRun(this.runId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (run) => {
          this.runName = run.name;
          this.runStatus = run.status;
        },
        error: (error) => (this.error = listeningError(error)),
      });
    this.ws.sendRunId(this.runId);
    this.ws
      .getStateChangeMessages()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => {
        if (message.run_id === this.runId) this.runStatus = message.new_status;
      });
    timer(0, 5000)
      .pipe(
        exhaustMap(() =>
          this.client.studies(this.runId).pipe(
            catchError((error) => {
              this.error = listeningError(error);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((studies) => {
        this.loading = false;
        if (!studies) return;
        this.studies = studies;
        const selected = studies.find((study) => study.id === this.selected?.id) ?? studies[0];
        if (
          selected &&
          !this.busy &&
          !this.detailLoading &&
          (!this.selected || selected.revision !== this.selected.revision)
        )
          void this.select(selected);
      });
  }
  public get collecting(): boolean {
    return this.selected?.status === 'collecting';
  }
  public get validCount(): boolean {
    return Number.isInteger(this.invitationCount) && this.invitationCount >= 1 && this.invitationCount <= 100;
  }
  public get canFinalize(): boolean {
    return (
      this.studies.length > 0 &&
      this.studies.every((study) => study.status !== 'collecting') &&
      (this.runStatus === RunStatus.AWAITING_INPUT || this.runStatus === RunStatus.FAILED)
    );
  }
  public async select(study: Study): Promise<void> {
    const generation = ++this.generation;
    if (this.selected?.id !== study.id) {
      this.results = null;
      this.links = [];
      this.heads = [];
      this.participantActionsVisible = false;
      this.participantPage = 0;
    }
    this.selected = study;
    this.instructions = study.instructions;
    this.consent = study.consent;
    this.detailLoading = true;
    try {
      const details = await firstValueFrom(
        forkJoin({ heads: this.client.sessions(study.id), results: this.client.results(study.id) }),
      );
      if (generation === this.generation) {
        this.heads = details.heads;
        if (!this.actionParticipant) this.participantActionsVisible = false;
        this.participantPage = this.participantFirst / this.participantPageSize;
        this.results = details.results;
      }
    } catch (error) {
      if (generation === this.generation) this.error = listeningError(error);
    } finally {
      if (generation === this.generation) this.detailLoading = false;
    }
  }
  public async refresh(): Promise<void> {
    if (this.selected) await this.select(await firstValueFrom(this.client.study(this.selected.id)));
  }
  public async action(work: () => Promise<unknown>, notice = 'Saved'): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    try {
      await work();
      this.notice = notice;
      await this.refresh();
    } catch (error) {
      this.error = listeningError(error);
    } finally {
      this.busy = false;
    }
  }
  public invite(count = this.invitationCount): void {
    const study = this.selected;
    if (!study || !Number.isInteger(count) || count < 1 || count > 100) return;
    void this.action(async () => {
      const invitations = await firstValueFrom(this.client.invitations(study.id, count));
      this.links = invitations.map((invitation) => new URL(invitation.path, location.origin).href);
    }, 'Copy these links now. They cannot be retrieved again. Give one individual link to each participant.');
  }
  public pasteProtocol(event: ClipboardEvent, field: 'instructions' | 'consent'): void {
    const html = event.clipboardData?.getData('text/html');
    const input = event.target as HTMLTextAreaElement;
    if (!html) return;
    event.preventDefault();
    const formatted = new ProtocolHtmlPipe().transform(html);
    const next = this[field].slice(0, input.selectionStart) + formatted + this[field].slice(input.selectionEnd);
    if (next.length > 10000) {
      this.error = 'Formatted text exceeds 10,000 characters. Paste a shorter selection.';
      return;
    }
    this[field] = next;
  }

  public editInstructions(): void {
    const study = this.selected;
    if (study) void this.action(() => firstValueFrom(this.client.instructions(study, this.instructions, this.consent)));
  }
  public exclude(head: SessionHead): void {
    const study = this.selected;
    const reason = this.reasons[head.session_id]?.trim();
    if (study && reason) void this.action(() => firstValueFrom(this.client.exclude(study, head, reason)));
  }
  public canDeleteInvitation(head: SessionHead): boolean {
    return (
      this.collecting &&
      head.status === 'invited' &&
      head.revision === 0 &&
      !head.excluded &&
      !head.exclusion_audit?.length
    );
  }

  public deleteInvitation(head: SessionHead): void {
    const study = this.selected;
    if (
      !study ||
      !this.canDeleteInvitation(head) ||
      !confirm('Permanently delete this unused invitation? Its link will stop working and its row will be removed.')
    )
      return;
    void this.action(async () => {
      await firstValueFrom(this.client.deleteUnusedInvitation(study.id, head.session_id));
      delete this.reasons[head.session_id];
      this.links = [];
    }, 'Unused invitation deleted. Its link is no longer valid.');
  }

  public revoke(head: SessionHead): void {
    const study = this.selected;
    if (
      study &&
      confirm('Revoke this invitation? Existing answers remain retained; use exclusion to omit them from analysis.')
    )
      void this.action(() => firstValueFrom(this.client.revoke(study.id, head.session_id)));
  }
  public close(): void {
    const study = this.selected;
    if (!study) return;
    const empty = !this.heads.some((head) => head.status === 'completed' && !head.excluded);
    if (
      !confirm(
        `${empty ? 'No completed included sessions: final results will be empty. ' : ''}Close collection permanently? Unfinished drafts are frozen and excluded from analysis. This cannot be undone.`,
      )
    )
      return;
    void this.action(async () => {
      const result = await firstValueFrom(this.client.close(study, empty));
      if (result.finalization_queued) this.runStatus = RunStatus.QUEUED;
    }, 'Collection frozen. Finalization starts when every study is closed.');
  }
  public finalize(): void {
    void this.action(async () => {
      await firstValueFrom(this.client.finalize(this.runId));
      this.runStatus = RunStatus.QUEUED;
    }, 'Finalization queued; PLC processing is not rerun.');
  }
  public async copyLinks(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.links.join('\n'));
      this.notice = 'Links copied';
    } catch {
      this.notice = 'Clipboard unavailable. Select and copy the links manually.';
    }
  }
  public flag(value: string): string {
    return value.replaceAll('_', ' ');
  }
}
