import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { Subject, Subscription, debounceTime, takeUntil } from 'rxjs';
import { PluginsClient } from '../../../shared/clients/plugins.client';
import { PluginDiagnostic, PluginSource, PluginValidation } from '../../../shared/interfaces/plugin.interface';
import { PythonEditorComponent } from './python-editor.component';

@Component({
  selector: 'plc-plugin-editor',
  standalone: true,
  imports: [RouterLink, ButtonModule, TagModule, PythonEditorComponent],
  templateUrl: './plugin-editor.component.html',
  styleUrl: './plugin-editor.component.scss',
})
export class PluginEditorComponent implements OnInit, OnDestroy {
  public filename = '';
  public source: PluginSource | null = null;
  public content = '';
  public loading = false;
  public saving = false;
  public validating = false;
  public diagnostics: PluginDiagnostic[] = [];
  public valid: boolean | null = null;
  public error: string | null = null;
  public notice: string | null = null;
  public conflict = false;

  private readonly edits = new Subject<void>();
  private readonly destroyed = new Subject<void>();
  private validationSubscription?: Subscription;
  private loadSubscription?: Subscription;
  private version = 0;

  constructor(
    private readonly client: PluginsClient,
    private readonly route: ActivatedRoute,
  ) {}

  public get dirty(): boolean {
    return this.source !== null && this.content !== this.source.content;
  }

  public ngOnInit(): void {
    this.edits.pipe(debounceTime(750), takeUntil(this.destroyed)).subscribe(() => this.validate());
    this.route.paramMap.pipe(takeUntil(this.destroyed)).subscribe((params) => {
      this.filename = params.get('filename') ?? '';
      this.source = null;
      this.load();
    });
  }

  public load(): void {
    if (this.saving || (this.dirty && !window.confirm('Discard unsaved changes and reload the plugin?'))) return;
    this.loadSubscription?.unsubscribe();
    this.invalidateValidation();
    this.loading = true;
    this.error = null;
    this.notice = null;
    this.loadSubscription = this.client
      .getSource(this.filename)
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (source) => {
          this.source = source;
          this.content = source.content;
          this.conflict = false;
          this.loading = false;
          this.validate();
        },
        error: (error) => {
          this.loading = false;
          this.error = this.errorMessage(error, 'Unable to load plugin source.');
        },
      });
  }

  public edit(content: string): void {
    this.content = content;
    this.notice = null;
    this.invalidateValidation();
    this.edits.next();
  }

  private invalidateValidation(): void {
    this.version++;
    this.validationSubscription?.unsubscribe();
    this.validating = false;
    this.valid = null;
    this.diagnostics = [];
  }

  public validate(): void {
    if (!this.source || this.loading || this.saving) return;
    this.validationSubscription?.unsubscribe();
    const version = this.version;
    this.validating = true;
    if (!this.conflict) this.error = null;
    this.validationSubscription = this.client
      .validateSource(this.filename, this.content)
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (result) => {
          if (version !== this.version) return;
          this.validating = false;
          this.applyValidation(result);
        },
        error: (error) => {
          if (version !== this.version) return;
          this.validating = false;
          this.valid = null;
          this.error = this.errorMessage(error, 'Unable to validate the plugin. Try again.');
        },
      });
  }

  private applyValidation(result: PluginValidation): void {
    this.valid = result.valid;
    this.diagnostics = result.diagnostics;
  }

  public save(): void {
    if (!this.source || !this.dirty || this.loading || this.saving || this.conflict) return;
    this.invalidateValidation();
    this.saving = true;
    this.error = null;
    this.notice = null;
    this.client
      .saveSource(this.filename, this.content, this.source.revision)
      .pipe(takeUntil(this.destroyed))
      .subscribe({
        next: (source) => {
          this.source = source;
          this.content = source.content;
          this.saving = false;
          this.applyValidation({ valid: true, diagnostics: [] });
          this.notice =
            'Plugin saved. Changes apply when the plugin is next loaded; already-running algorithms keep their current code.';
        },
        error: (error) => {
          this.saving = false;
          this.conflict = error.status === 409;
          this.error = this.errorMessage(error, 'Unable to save the plugin. Your changes are still in the editor.');
          const diagnostics = error.error?.detail?.diagnostics;
          if (Array.isArray(diagnostics)) this.applyValidation({ valid: false, diagnostics });
        },
      });
  }

  public discard(): void {
    if (!this.source || this.saving || !window.confirm('Discard your unsaved changes?')) return;
    this.content = this.source.content;
    this.notice = null;
    this.invalidateValidation();
    this.validate();
  }

  public canDeactivate(): boolean {
    if (this.saving) return false;
    return !this.dirty || window.confirm('Discard unsaved plugin changes and leave the editor?');
  }

  @HostListener('window:beforeunload', ['$event'])
  public beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty || this.saving) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private errorMessage(error: { error?: { detail?: string | { message?: string } } }, fallback: string): string {
    const detail = error.error?.detail;
    return typeof detail === 'string' ? detail : (detail?.message ?? fallback);
  }

  public ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    this.edits.complete();
    this.validationSubscription?.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }
}
