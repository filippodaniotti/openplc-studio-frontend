import { TestBed } from '@angular/core/testing';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { diagnosticCount } from '@codemirror/lint';
import { BehaviorSubject } from 'rxjs';
import { ThemeService } from '../../../shared/services/theme.service';
import { PythonEditorComponent } from './python-editor.component';

describe('PythonEditorComponent', () => {
  let dark: BehaviorSubject<boolean>;
  beforeEach(() => {
    dark = new BehaviorSubject(false);
    TestBed.configureTestingModule({
      imports: [PythonEditorComponent],
      providers: [{ provide: ThemeService, useValue: { isDarkMode: dark } }],
    });
  });

  it('renders source and emits user edits without emitting programmatic replacements', () => {
    const fixture = TestBed.createComponent(PythonEditorComponent);
    const changes = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(changes);
    fixture.componentRef.setInput('value', 'print("hello")');
    fixture.detectChanges();
    const view = EditorView.findFromDOM(fixture.nativeElement.querySelector('.cm-editor'))!;
    expect(view.state.doc.toString()).toBe('print("hello")');
    expect(fixture.nativeElement.querySelector('[aria-label="Python plugin source"]')).not.toBeNull();
    expect(changes).not.toHaveBeenCalled();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'edited' } });
    expect(changes).toHaveBeenCalledWith('edited');
    changes.calls.reset();
    fixture.componentRef.setInput('value', 'reloaded');
    fixture.detectChanges();
    expect(view.state.doc.toString()).toBe('reloaded');
    expect(changes).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('shows diagnostic markers, reveals locations, and supports read-only state', () => {
    const fixture = TestBed.createComponent(PythonEditorComponent);
    fixture.componentRef.setInput('value', 'line one\nline two');
    fixture.componentRef.setInput('diagnostics', [{ message: 'Syntax error', line: 2, column: 3 }]);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const view = EditorView.findFromDOM(fixture.nativeElement.querySelector('.cm-editor'))!;
    expect(diagnosticCount(view.state)).toBe(1);
    expect(view.state.facet(EditorState.readOnly)).toBeTrue();
    fixture.componentInstance.reveal(2, 3);
    expect(view.state.selection.main.head).toBe(11);
    fixture.componentRef.setInput('diagnostics', []);
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(diagnosticCount(view.state)).toBe(0);
    expect(view.state.facet(EditorState.readOnly)).toBeFalse();
    fixture.destroy();
  });

  it('preserves Windows line endings while editing', () => {
    const fixture = TestBed.createComponent(PythonEditorComponent);
    const changes = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(changes);
    fixture.componentRef.setInput('value', 'first\r\nsecond');
    fixture.detectChanges();
    const view = EditorView.findFromDOM(fixture.nativeElement.querySelector('.cm-editor'))!;
    expect(view.state.sliceDoc()).toBe('first\r\nsecond');
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\r\nthird' } });
    expect(changes).toHaveBeenCalledWith('first\r\nsecond\r\nthird');
    fixture.destroy();
  });

  it('updates the theme and unsubscribes when disposed', () => {
    const fixture = TestBed.createComponent(PythonEditorComponent);
    fixture.detectChanges();
    const view = EditorView.findFromDOM(fixture.nativeElement.querySelector('.cm-editor'))!;
    expect(view.state.facet(EditorView.darkTheme)).toBeFalse();
    dark.next(true);
    expect(view.state.facet(EditorView.darkTheme)).toBeTrue();
    dark.next(false);
    expect(view.state.facet(EditorView.darkTheme)).toBeFalse();
    expect(dark.observed).toBeTrue();
    fixture.destroy();
    expect(dark.observed).toBeFalse();
  });
});
