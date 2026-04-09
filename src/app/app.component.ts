import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { HeaderComponent } from './header/header.component';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { WsService } from './shared/services/ws.service';
import { Subject, takeUntil, tap } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule, ToggleButtonModule, FormsModule, HeaderComponent, ToastModule],
  providers: [MessageService, WsService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  public title = 'PLC Testbench Platform';

  private destroy$ = new Subject<void>();

  constructor(
    private readonly messageService: MessageService,
    private readonly wsService: WsService,
  ) {}

  public ngOnInit(): void {
    this.wsService
      .getCompletionMessages()
      .pipe(
        takeUntil(this.destroy$),
        tap((message: any) =>
          this.messageService.add({
            severity: 'success',
            summary: 'Run completed',
            detail: `La run ${message.run_name} è stata completata con successo`,
          }),
        ),
      )
      .subscribe();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
