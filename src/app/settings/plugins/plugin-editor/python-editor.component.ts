import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { setDiagnostics } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { Subscription } from 'rxjs';
import { PluginDiagnostic } from '../../../shared/interfaces/plugin.interface';
import { ThemeService } from '../../../shared/services/theme.service';

@Component({
  selector: 'plc-python-editor',
  standalone: true,
  template: '<div #host class="python-editor"></div>',
  styles: [
    ':host { display: block; min-width: 0; } .python-editor { border: 1px solid var(--p-content-border-color); border-radius: 0.5rem; overflow: hidden; }',
  ],
})
export class PythonEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() public value = '';
  @Input() public disabled = false;
  @Input() public diagnostics: PluginDiagnostic[] = [];
  @Output() public valueChange = new EventEmitter<string>();
  @Output() public saveRequested = new EventEmitter<void>();
  @ViewChild('host', { static: true }) private host!: ElementRef<HTMLElement>;

  private view?: EditorView;
  private readonly theme = new Compartment();
  private readonly editing = new Compartment();
  private readonly lineEnding = new Compartment();
  private themeSubscription?: Subscription;
  private updating = false;

  constructor(private readonly themeService: ThemeService) {}

  public ngAfterViewInit(): void {
    this.view = new EditorView({
      parent: this.host.nativeElement,
      doc: this.value,
      extensions: [
        basicSetup,
        python(),
        EditorState.tabSize.of(4),
        indentUnit.of('    '),
        this.lineEnding.of(EditorState.lineSeparator.of(this.separator)),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              this.saveRequested.emit();
              return true;
            },
          },
          indentWithTab,
        ]),
        EditorView.contentAttributes.of({ 'aria-label': 'Python plugin source' }),
        EditorView.theme({
          '&': { height: '65vh', minHeight: '24rem', fontSize: '14px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace' },
        }),
        this.theme.of([]),
        this.editing.of(EditorState.readOnly.of(this.disabled)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.updating) this.valueChange.emit(update.state.sliceDoc());
        }),
      ],
    });
    this.themeSubscription = this.themeService.isDarkMode.subscribe((dark) => {
      this.view?.dispatch({ effects: this.theme.reconfigure(dark ? oneDark : []) });
    });
    this.ngOnChanges();
  }

  public ngOnChanges(): void {
    if (!this.view) return;
    this.updating = true;
    try {
      this.view.dispatch({ effects: this.lineEnding.reconfigure(EditorState.lineSeparator.of(this.separator)) });
      if (this.view.state.sliceDoc() !== this.value) {
        this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: this.value } });
      }
      this.view.dispatch({
        effects: this.editing.reconfigure([
          EditorState.readOnly.of(this.disabled),
          EditorView.editable.of(!this.disabled),
        ]),
      });
      this.view.dispatch(
        setDiagnostics(
          this.view.state,
          this.diagnostics
            .filter((item) => item.line !== null)
            .map((item) => {
              const from = this.position(item.line!, item.column ?? 1);
              return {
                from,
                to: Math.min(from + 1, this.view!.state.doc.length),
                severity: 'error' as const,
                message: item.message,
              };
            }),
        ),
      );
    } finally {
      this.updating = false;
    }
  }

  private get separator(): string {
    return this.value.includes('\r\n') ? '\r\n' : '\n';
  }

  public reveal(line: number, column = 1): void {
    if (!this.view) return;
    const anchor = this.position(line, column);
    this.view.dispatch({ selection: { anchor }, scrollIntoView: true });
    this.view.focus();
  }

  private position(line: number, column: number): number {
    const doc = this.view!.state.doc;
    const row = doc.line(Math.max(1, Math.min(line, doc.lines)));
    const offset = Array.from(row.text)
      .slice(0, Math.max(0, column - 1))
      .join('').length;
    return row.from + offset;
  }

  public ngOnDestroy(): void {
    this.themeSubscription?.unsubscribe();
    this.view?.destroy();
  }
}
